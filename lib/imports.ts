import { z } from "zod";
import Papa from "papaparse";
import { ApiError, productInput, cents } from "./domain";
import { all, insert, database, uuid, auditStatement } from "./database";
import type { Context } from "./service";
export async function importCsv(ctx: Context, kind: string, raw: any) {
  const csv = z.string().min(1).max(1_000_000).parse(raw.csv);
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });
  if (parsed.errors.length)
    throw new ApiError(400, "CSV no válido: " + parsed.errors[0].message);
  if (parsed.data.length > 1000)
    throw new ApiError(400, "Importa máximo 1.000 filas por archivo");
  if (!parsed.data.length)
    throw new ApiError(400, "El archivo no contiene filas");
  const rows = [];
  const errors: string[] = [];
  const existing =
    kind === "products"
      ? await all("SELECT sku FROM products WHERE org=?", ctx.org)
      : await all("SELECT external_id FROM bank_entries WHERE org=?", ctx.org);
  const seen = new Set(
    existing.map((r) => String(kind === "products" ? r.sku : r.external_id)),
  );
  let skipped = 0;
  for (let i = 0; i < parsed.data.length; i++) {
    const r = parsed.data[i];
    try {
      if (kind === "products") {
        const p = productInput.parse({
          sku: r.sku,
          name: r.nombre,
          category: r.categoria,
          barcode: r.codigo_barras || "",
          cost: cents(r.costo),
          price: cents(r.precio),
          wholesalePrice: cents(r.precio_mayorista),
          wholesaleMin: Number(r.minimo_mayorista || 6),
          taxRate: Number(r.iva),
          minStock: Number(r.stock_minimo || 10),
        });
        if (seen.has(p.sku)) {
          skipped++;
          continue;
        }
        seen.add(p.sku);
        rows.push(
          insert("products", {
            id: uuid(),
            org: ctx.org,
            sku: p.sku,
            name: p.name,
            category: p.category,
            barcode: p.barcode,
            cost: p.cost,
            price: p.price,
            wholesale_price: p.wholesalePrice,
            wholesale_min: p.wholesaleMin,
            tax_rate: p.taxRate,
            min_stock: p.minStock,
          }),
        );
      } else if (kind === "bank") {
        const p = z
          .object({
            id: z.string().min(1).max(100),
            fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            descripcion: z.string().min(1).max(200),
            monto: z.string().min(1),
          })
          .parse(r);
        const amount = cents(p.monto);
        if (amount === 0) throw new Error("El monto no puede ser cero");
        if (seen.has(p.id)) {
          skipped++;
          continue;
        }
        seen.add(p.id);
        rows.push(
          insert("bank_entries", {
            id: uuid(),
            org: ctx.org,
            external_id: p.id,
            date: p.fecha,
            description: p.descripcion,
            amount,
          }),
        );
      } else throw new ApiError(404, "Formato no disponible");
    } catch (e) {
      errors.push(
        "Fila " +
          (i + 2) +
          ": " +
          (e instanceof z.ZodError
            ? e.issues.map((x) => x.path.join(".") + " " + x.message).join(", ")
            : String(e)),
      );
    }
  }
  if (errors.length) return { valid: false, errors, imported: 0 };
  if (raw.preview === true)
    return {
      valid: true,
      count: rows.length,
      skipped,
      columns: parsed.meta.fields,
      preview: parsed.data.slice(0, 5),
    };
  await database().batch([
    ...rows,
    auditStatement(
      ctx.org,
      ctx.actor,
      "CSV importado",
      kind + ": " + rows.length + " filas",
    ),
  ]);
  return { valid: true, imported: rows.length, skipped };
}
