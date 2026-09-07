import type { Snapshot, Row } from "./domain";
import { safeCsvCell } from "./domain";
import Papa from "papaparse";
export async function api(path: string, space: string, body?: unknown) {
  const response = await fetch("/api/erp/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-nexo-space": space },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json"))
    throw new Error("La sesión venció. Recarga e inicia sesión.");
  const result = (await response.json()) as any;
  if (!response.ok)
    throw new Error(result.error || "No se pudo completar la solicitud");
  return result;
}
export function download(
  name: string,
  data: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(name: string, rows: Row[]) {
  if (!rows.length) throw new Error("No hay filas para exportar");
  download(
    name,
    "\uFEFF" +
      Papa.unparse(
        rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k, safeCsvCell(v)]),
          ),
        ),
      ),
  );
}
export const channelLabel: Record<string, string> = {
  pos: "Punto de venta",
  wholesale: "Mayorista",
  online: "Online",
};
export const methodLabel: Record<string, string> = {
  cash: "Efectivo",
  card: "Datáfono",
  transfer: "Transferencia",
  credit: "Crédito",
  wompi: "Wompi",
};
export function exportProducts(data: Snapshot) {
  csv(
    "productos.csv",
    data.products.map((p) => ({
      sku: p.sku,
      nombre: p.name,
      categoria: p.category,
      codigo_barras: p.barcode,
      costo: p.cost / 100,
      precio: p.price / 100,
      precio_mayorista: p.wholesale_price / 100,
      minimo_mayorista: p.wholesale_min,
      iva: p.tax_rate,
      stock_minimo: p.min_stock,
    })),
  );
}
