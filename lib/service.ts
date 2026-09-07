import { z } from "zod";
import {
  all,
  first,
  insert,
  statement,
  database,
  uuid,
  now,
  auditStatement,
} from "./database";
import {
  ApiError,
  productInput,
  contactInput,
  saleInput,
  purchaseInput,
  priceLines,
  identifier,
  type Row,
  type Snapshot,
} from "./domain";
export type Context = {
  org: string;
  actor: string;
  demo: boolean;
  device?: boolean;
};
export async function owned(
  table:
    | "products"
    | "locations"
    | "contacts"
    | "sales"
    | "purchases"
    | "payments"
    | "bank_entries"
    | "devices",
  id: string,
  org: string,
) {
  const row = await first(
    `SELECT * FROM ${table} WHERE id=? AND org=?`,
    id,
    org,
  );
  if (!row) throw new ApiError(404, "Registro no encontrado");
  return row;
}
export async function snapshot(org: string): Promise<Snapshot> {
  const specs = [
    ["locations", "locations"],
    ["products", "products"],
    ["stock", "stock"],
    ["contacts", "contacts"],
    ["sales", "sales"],
    ["items", "sale_items"],
    ["purchases", "purchases"],
    ["purchaseItems", "purchase_items"],
    ["payments", "payments"],
    ["expenses", "expenses"],
    ["movements", "movements"],
    ["bank", "bank_entries"],
    ["events", "events"],
    ["audit", "audit"],
    ["refunds", "refunds"],
  ];
  const values = await database().batch(
    specs.map(([, table]) =>
      statement(`SELECT * FROM ${table} WHERE org=?`, org),
    ),
  );
  const result: Row = {
    org: await first("SELECT * FROM organizations WHERE id=?", org),
    integrations: await all(
      "SELECT provider,updated_at FROM integrations WHERE org=?",
      org,
    ),
    devices: await all(
      "SELECT id,name,created_at,expires_at,revoked FROM devices WHERE org=?",
      org,
    ),
  };
  specs.forEach(([key], i) => (result[key] = values[i].results));
  return result as Snapshot;
}
export async function createSale(
  ctx: Context,
  body: unknown,
  extra?: {
    externalId: string;
    lines: Row[];
    provider: string;
    eventId: string;
  },
) {
  const data = saleInput.parse(body);
  const existing = await first(
    "SELECT * FROM sales WHERE org=? AND idempotency_key=?",
    ctx.org,
    data.idempotencyKey,
  );
  if (existing) return existing;
  await owned("locations", data.locationId, ctx.org);
  if (data.customerId) {
    const contact = await owned("contacts", data.customerId, ctx.org);
    if (contact.kind !== "customer")
      throw new ApiError(400, "Selecciona un cliente");
  }
  const products = await all(
    "SELECT * FROM products WHERE org=? AND active=1",
    ctx.org,
  );
  const lines = extra?.lines ?? priceLines(products, data.items, data.channel);
  const id = uuid();
  const total = lines.reduce((a, l) => a + l.total, 0);
  if (total <= 0 || !Number.isSafeInteger(total))
    throw new ApiError(400, "La venta debe tener un total válido mayor a cero");
  const row = {
    id,
    org: ctx.org,
    number: "NV-" + id.slice(0, 8).toUpperCase(),
    location_id: data.locationId,
    customer_id: data.customerId,
    channel: data.channel,
    status: data.paymentMethod === "wompi" ? "pending" : "completed",
    payment_method: data.paymentMethod,
    subtotal: lines.reduce((a, l) => a + l.subtotal, 0),
    tax: lines.reduce((a, l) => a + l.tax, 0),
    total,
    cost: lines.reduce((a, l) => a + l.unitCost * l.quantity, 0),
    paid: 0,
    created_at: now(),
    due_date: data.dueDate,
    idempotency_key: data.idempotencyKey,
    external_id: extra?.externalId ?? null,
    note: data.note,
  };
  const queries = [
    insert("sales", row),
    ...lines.map((l) =>
      insert("sale_items", {
        id: uuid(),
        org: ctx.org,
        sale_id: id,
        product_id: l.productId,
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        unit_cost: l.unitCost,
        tax_rate: l.taxRate,
        subtotal: l.subtotal,
        tax: l.tax,
        total: l.total,
      }),
    ),
    auditStatement(ctx.org, ctx.actor, "Venta creada", row.number),
  ];
  if (!["credit", "wompi"].includes(data.paymentMethod))
    queries.push(
      insert("payments", {
        id: uuid(),
        org: ctx.org,
        sale_id: id,
        amount: total,
        method: data.paymentMethod,
        reference: row.number,
        created_at: row.created_at,
        idempotency_key: "sale-" + data.idempotencyKey,
      }),
    );
  if (extra)
    queries.push(
      insert("events", {
        id: uuid(),
        org: ctx.org,
        provider: extra.provider,
        external_id: extra.eventId,
        status: "processed",
        message: row.number,
        created_at: now(),
      }),
    );
  try {
    await database().batch(queries);
  } catch (e) {
    const duplicate = await first(
      "SELECT * FROM sales WHERE org=? AND idempotency_key=?",
      ctx.org,
      data.idempotencyKey,
    );
    if (duplicate) return duplicate;
    if (String(e).includes("stock_nonnegative"))
      throw new ApiError(
        409,
        "Stock insuficiente. Actualiza el inventario y ajusta las cantidades.",
      );
    throw e;
  }
  return await owned("sales", id, ctx.org);
}
export async function mutate(ctx: Context, path: string[], raw: any) {
  const { org, actor } = ctx;
  const [resource, id, action] = path;
  if (resource === "products" && !id) {
    const p = productInput.parse(raw);
    const pid = uuid();
    await database().batch([
      insert("products", {
        id: pid,
        org,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        category: p.category,
        unit: p.unit,
        cost: p.cost,
        price: p.price,
        wholesale_price: p.wholesalePrice,
        wholesale_min: p.wholesaleMin,
        tax_rate: p.taxRate,
        min_stock: p.minStock,
      }),
      auditStatement(org, actor, "Producto creado", p.sku),
    ]);
    return { id: pid };
  }
  if (resource === "products" && id) {
    await owned("products", id, org);
    const p = productInput.parse(raw);
    await database().batch([
      statement(
        "UPDATE products SET sku=?,barcode=?,name=?,category=?,unit=?,price=?,wholesale_price=?,wholesale_min=?,tax_rate=?,min_stock=? WHERE id=? AND org=?",
        p.sku,
        p.barcode,
        p.name,
        p.category,
        p.unit,
        p.price,
        p.wholesalePrice,
        p.wholesaleMin,
        p.taxRate,
        p.minStock,
        id,
        org,
      ),
      auditStatement(org, actor, "Producto actualizado", p.sku),
    ]);
    return { id };
  }
  if (resource === "contacts") {
    const p = contactInput.parse(raw);
    const cid = uuid();
    await database().batch([
      insert("contacts", { id: cid, org, ...p }),
      auditStatement(org, actor, "Contacto creado", p.name),
    ]);
    return { id: cid };
  }
  if (resource === "locations") {
    const name = z.string().trim().min(2).max(80).parse(raw.name);
    const lid = uuid();
    await database().batch([
      insert("locations", { id: lid, org, name }),
      auditStatement(org, actor, "Sede creada", name),
    ]);
    return { id: lid };
  }
  if (resource === "inventory") {
    const p = z
      .object({
        productId: identifier,
        locationId: identifier,
        toLocationId: identifier.optional(),
        quantity: z
          .number()
          .int()
          .min(-100000)
          .max(100000)
          .refine((v) => v !== 0),
        note: z.string().trim().min(3).max(300),
        idempotencyKey: identifier,
      })
      .parse(raw);
    const product = await owned("products", p.productId, org);
    await owned("locations", p.locationId, org);
    const ref = "movement-" + p.idempotencyKey;
    if (
      await first(
        "SELECT id FROM movements WHERE org=? AND reference=?",
        org,
        ref,
      )
    )
      return { ok: true };
    const rows = [];
    if (p.toLocationId) {
      await owned("locations", p.toLocationId, org);
      if (p.toLocationId === p.locationId || p.quantity < 1)
        throw new ApiError(400, "Selecciona otra sede y una cantidad positiva");
      rows.push(
        insert("movements", {
          id: org + "-" + p.idempotencyKey + "-out",
          org,
          product_id: p.productId,
          location_id: p.locationId,
          quantity: -p.quantity,
          unit_cost: product.cost,
          kind: "transfer",
          reference: ref,
          note: p.note,
          created_at: now(),
        }),
        insert("movements", {
          id: org + "-" + p.idempotencyKey + "-in",
          org,
          product_id: p.productId,
          location_id: p.toLocationId,
          quantity: p.quantity,
          unit_cost: product.cost,
          kind: "transfer",
          reference: ref,
          note: p.note,
          created_at: now(),
        }),
      );
    } else
      rows.push(
        insert("movements", {
          id: org + "-" + p.idempotencyKey,
          org,
          product_id: p.productId,
          location_id: p.locationId,
          quantity: p.quantity,
          unit_cost: product.cost,
          kind: "adjustment",
          reference: ref,
          note: p.note,
          created_at: now(),
        }),
      );
    rows.push(
      auditStatement(org, actor, "Movimiento de inventario", product.sku),
    );
    await database().batch(rows);
    return { ok: true };
  }
  if (resource === "sales" && !id) return createSale(ctx, raw);
  if (resource === "sales" && action === "void") {
    const s = await owned("sales", id, org);
    if (s.status === "voided") return s;
    if (
      s.invoice_status === "validated" ||
      (s.payment_method === "wompi" && s.paid > 0)
    )
      throw new ApiError(
        409,
        "Gestiona primero la nota crédito o el reembolso con el proveedor. No se puede anular desde Abástelo.",
      );
    if (raw.confirm !== true)
      throw new ApiError(
        400,
        "Confirma la devolución total y el reembolso efectuado",
      );
    const queries = [
      statement(
        "UPDATE sales SET status='voided' WHERE id=? AND org=? AND status!='voided'",
        id,
        org,
      ),
      auditStatement(org, actor, "Venta anulada y stock devuelto", s.number),
    ];
    if (s.paid > 0)
      queries.push(
        insert("refunds", {
          id: uuid(),
          org,
          sale_id: id,
          amount: s.paid,
          method: s.payment_method,
          created_at: now(),
        }),
      );
    await database().batch(queries);
    return { ok: true };
  }
  if (resource === "payments") {
    const p = z
      .object({
        saleId: identifier.optional(),
        purchaseId: identifier.optional(),
        amount: z.number().int().positive().max(1e13),
        method: z.enum(["cash", "card", "transfer"]),
        reference: z.string().trim().min(1).max(150),
        idempotencyKey: identifier,
      })
      .parse(raw);
    if (Boolean(p.saleId) === Boolean(p.purchaseId))
      throw new ApiError(400, "Selecciona una venta o una compra");
    if (
      await first(
        "SELECT id FROM payments WHERE org=? AND idempotency_key=?",
        org,
        p.idempotencyKey,
      )
    )
      return { ok: true };
    const doc = await owned(
      p.saleId ? "sales" : "purchases",
      p.saleId || p.purchaseId!,
      org,
    );
    if (
      doc.status === "voided" ||
      doc.status === "pending" ||
      doc.status === "ordered"
    )
      throw new ApiError(400, "El documento no admite abonos manuales");
    if (doc.total - doc.paid < p.amount)
      throw new ApiError(400, "El abono supera el saldo pendiente");
    await database().batch([
      insert("payments", {
        id: uuid(),
        org,
        sale_id: p.saleId ?? null,
        purchase_id: p.purchaseId ?? null,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        created_at: now(),
        idempotency_key: p.idempotencyKey,
      }),
      auditStatement(org, actor, "Abono registrado", doc.number),
    ]);
    return { ok: true };
  }
  if (resource === "purchases" && !id) {
    const p = purchaseInput.parse(raw);
    const existing = await first(
      "SELECT id FROM purchases WHERE org=? AND idempotency_key=?",
      org,
      p.idempotencyKey,
    );
    if (existing) return existing;
    await owned("locations", p.locationId, org);
    const supplier = await owned("contacts", p.supplierId, org);
    if (supplier.kind !== "supplier")
      throw new ApiError(400, "Selecciona un proveedor");
    const unique = new Set(p.items.map((i) => i.productId));
    if (unique.size !== p.items.length)
      throw new ApiError(400, "Agrupa las cantidades por producto");
    for (const item of p.items) await owned("products", item.productId, org);
    const pid = uuid();
    const number = "OC-" + pid.slice(0, 8).toUpperCase();
    const subtotal = p.items.reduce((a, i) => a + i.quantity * i.unitCost, 0);
    const tax = p.items.reduce(
      (a, i) => a + Math.round((i.quantity * i.unitCost * i.taxRate) / 100),
      0,
    );
    const total = subtotal + tax;
    if (!Number.isSafeInteger(total) || total <= 0)
      throw new ApiError(400, "Total de compra no válido");
    await database().batch([
      insert("purchases", {
        id: pid,
        org,
        number,
        supplier_id: p.supplierId,
        location_id: p.locationId,
        status: "ordered",
        subtotal,
        tax,
        total,
        created_at: now(),
        due_date: p.dueDate,
        idempotency_key: p.idempotencyKey,
      }),
      ...p.items.map((i) =>
        insert("purchase_items", {
          id: uuid(),
          org,
          purchase_id: pid,
          product_id: i.productId,
          quantity: i.quantity,
          unit_cost: i.unitCost,
          tax_rate: i.taxRate,
          tax: Math.round((i.quantity * i.unitCost * i.taxRate) / 100),
        }),
      ),
      auditStatement(org, actor, "Orden de compra creada", number),
    ]);
    return { id: pid };
  }
  if (resource === "purchases" && action === "receive") {
    const p = await owned("purchases", id, org);
    if (p.status === "received") return p;
    await database().batch([
      statement(
        "UPDATE purchases SET status='received',received_at=? WHERE id=? AND org=? AND status='ordered'",
        now(),
        id,
        org,
      ),
      auditStatement(org, actor, "Compra recibida", p.number),
    ]);
    return { ok: true };
  }
  if (resource === "expenses") {
    const p = z
      .object({
        description: z.string().trim().min(3).max(150),
        category: z.enum([
          "Arriendo",
          "Servicios",
          "Logística",
          "Marketing",
          "Operación",
          "Nómina",
          "Otros",
        ]),
        amount: z.number().int().positive().max(1e13),
        method: z.enum(["cash", "card", "transfer"]),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        idempotencyKey: identifier,
      })
      .parse(raw);
    if (
      await first(
        "SELECT id FROM expenses WHERE org=? AND idempotency_key=?",
        org,
        p.idempotencyKey,
      )
    )
      return { ok: true };
    await database().batch([
      insert("expenses", {
        id: uuid(),
        org,
        description: p.description,
        category: p.category,
        amount: p.amount,
        method: p.method,
        created_at: p.date + "T12:00:00-05:00",
        idempotency_key: p.idempotencyKey,
      }),
      auditStatement(org, actor, "Gasto registrado", p.description),
    ]);
    return { ok: true };
  }
  if (resource === "settings") {
    const p = z
      .object({
        name: z.string().trim().min(2).max(120),
        nit: z.string().max(25),
        email: z.union([z.literal(""), z.email()]),
        phone: z.string().max(30),
        address: z.string().max(150),
        city: z.string().max(80),
      })
      .parse(raw);
    await database().batch([
      statement(
        "UPDATE organizations SET name=?,nit=?,email=?,phone=?,address=?,city=? WHERE id=?",
        p.name,
        p.nit,
        p.email,
        p.phone,
        p.address,
        p.city,
        org,
      ),
      auditStatement(org, actor, "Datos de empresa actualizados", p.name),
    ]);
    return { ok: true };
  }
  if (resource === "bank" && id && action === "match") {
    const entry = await owned("bank_entries", id, org);
    const payment = await owned(
      "payments",
      identifier.parse(raw.paymentId),
      org,
    );
    const signed = payment.sale_id ? payment.amount : -payment.amount;
    if (entry.amount !== signed)
      throw new ApiError(
        400,
        "Los montos o el sentido del movimiento no coinciden",
      );
    if (entry.payment_id) throw new ApiError(409, "Movimiento ya conciliado");
    await database().batch([
      statement(
        "UPDATE bank_entries SET payment_id=? WHERE id=? AND org=? AND payment_id IS NULL",
        payment.id,
        id,
        org,
      ),
      auditStatement(org, actor, "Movimiento conciliado", entry.external_id),
    ]);
    return { ok: true };
  }
  if (resource === "devices") {
    if (ctx.device)
      throw new ApiError(403, "Administra dispositivos desde la web");
    if (id) {
      await owned("devices", id, org);
      await statement(
        "UPDATE devices SET revoked=1 WHERE id=? AND org=?",
        id,
        org,
      ).run();
      return { ok: true };
    }
    const name = z.string().trim().min(2).max(80).parse(raw.name);
    const token =
      "nx_" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const tokenHash = Array.from(new Uint8Array(hash))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const deviceId = uuid();
    const expiresAt = new Date(Date.now() + 90 * 864e5).toISOString();
    await database().batch([
      insert("devices", {
        id: deviceId,
        org,
        name,
        token_hash: tokenHash,
        created_at: now(),
        expires_at: expiresAt,
      }),
      auditStatement(org, actor, "Dispositivo autorizado", name),
    ]);
    return { token, expiresAt };
  }
  throw new ApiError(404, "Operación no encontrada");
}
