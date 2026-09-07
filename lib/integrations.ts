import { env } from "cloudflare:workers";
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
import { ApiError, type Row } from "./domain";
import { seal, unseal, sha256, verifyWompi, hmacBase64, equal } from "./crypto";
import { owned, createSale, type Context } from "./service";
const secret = z.string().min(8).max(2000);
const configSchemas = {
  wompi: z.object({
    environment: z.enum(["sandbox", "production"]),
    publicKey: secret,
    privateKey: secret,
    integritySecret: secret,
    eventsSecret: secret,
  }),
  shopify: z.object({
    secret,
    shopDomain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
    locationId: z.string().min(1),
  }),
  woocommerce: z.object({ secret, locationId: z.string().min(1) }),
  factus: z.object({
    environment: z.enum(["sandbox", "production"]),
    clientId: z.string().min(1),
    clientSecret: secret,
    username: z.email(),
    password: secret,
    numberingRange: z.coerce.number().int().positive(),
  }),
};
function encryptionKey() {
  const key = (env as any).INTEGRATION_ENCRYPTION_KEY;
  if (!key)
    throw new ApiError(
      503,
      "El servidor necesita la clave de cifrado antes de guardar conexiones",
    );
  return key;
}
export async function getConfig(org: string, provider: string) {
  const row = await first(
    "SELECT config FROM integrations WHERE org=? AND provider=?",
    org,
    provider,
  );
  if (!row)
    throw new ApiError(409, "Configura " + provider + " en Integraciones");
  return unseal(row.config, encryptionKey());
}
export async function saveConfig(ctx: Context, provider: string, raw: any) {
  if (ctx.device) throw new ApiError(403, "Administra conexiones desde la web");
  if (!(provider in configSchemas))
    throw new ApiError(404, "Integración no disponible");
  const config =
    configSchemas[provider as keyof typeof configSchemas].parse(raw);
  if ("locationId" in config)
    await owned("locations", config.locationId, ctx.org);
  if (
    ctx.demo &&
    "environment" in config &&
    config.environment === "production"
  )
    throw new ApiError(400, "La demostración solo admite conexiones sandbox");
  await database().batch([
    statement(
      "INSERT INTO integrations(id,org,provider,config,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(org,provider) DO UPDATE SET config=excluded.config,updated_at=excluded.updated_at",
      uuid(),
      ctx.org,
      provider,
      await seal(config, encryptionKey()),
      now(),
    ),
    auditStatement(ctx.org, ctx.actor, "Conexión configurada", provider),
  ]);
  return { ok: true };
}
export async function checkout(ctx: Context, id: string) {
  const s = await owned("sales", id, ctx.org);
  if (s.status !== "pending" || s.payment_method !== "wompi")
    throw new ApiError(400, "La venta no tiene un pago Wompi pendiente");
  const c = await getConfig(ctx.org, "wompi");
  const signature = await sha256(s.id + s.total + "COP" + c.integritySecret);
  const url = new URL("https://checkout.wompi.co/p/");
  url.searchParams.set("public-key", c.publicKey);
  url.searchParams.set("currency", "COP");
  url.searchParams.set("amount-in-cents", String(s.total));
  url.searchParams.set("reference", s.id);
  url.searchParams.set("signature:integrity", signature);
  return { url: url.toString() };
}
export async function verifyRemoteWompi(c: Row, transaction: Row) {
  const root =
    c.environment === "production"
      ? "https://production.wompi.co"
      : "https://sandbox.wompi.co";
  const response = await fetch(
    root + "/v1/transactions/" + encodeURIComponent(transaction.id),
    {
      headers: { Authorization: "Bearer " + c.privateKey },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new ApiError(502, "No se pudo verificar la transacción con Wompi");
  const canonical = ((await response.json()) as any).data;
  if (
    !canonical ||
    canonical.id !== transaction.id ||
    canonical.status !== transaction.status ||
    canonical.amount_in_cents !== transaction.amount_in_cents
  )
    throw new ApiError(409, "La transacción aún no coincide con Wompi");
  return canonical;
}
export async function webhook(provider: string, org: string, request: Request) {
  if (!["wompi", "shopify", "woocommerce"].includes(provider))
    throw new ApiError(404, "Proveedor no encontrado");
  const c = await getConfig(org, provider);
  const raw = await request.text();
  if (raw.length > 1_000_000)
    throw new ApiError(413, "Evento demasiado grande");
  const body = JSON.parse(raw);
  if (provider === "wompi") {
    if (!(await verifyWompi(body, c.eventsSecret)))
      throw new ApiError(401, "Firma no válida");
    if (body.environment !== (c.environment === "production" ? "prod" : "test"))
      throw new ApiError(400, "Ambiente incorrecto");
    if (body.event !== "transaction.updated") return { ignored: true };
    const t = await verifyRemoteWompi(c, body.data.transaction);
    const s = await first(
      "SELECT * FROM sales WHERE org=? AND id=? AND payment_method=?",
      org,
      t.reference,
      "wompi",
    );
    if (!s || t.currency !== "COP" || s.total !== t.amount_in_cents)
      throw new ApiError(400, "Referencia, moneda o monto incorrecto");
    const key = t.id + ":" + t.status;
    if (
      await first(
        "SELECT id FROM events WHERE org=? AND provider=? AND external_id=?",
        org,
        provider,
        key,
      )
    )
      return { duplicate: true };
    const statements = [
      insert("events", {
        id: uuid(),
        org,
        provider,
        external_id: key,
        status: "processed",
        message: t.status,
        created_at: now(),
      }),
    ];
    if (t.status === "APPROVED") {
      if (s.status === "voided")
        throw new ApiError(
          409,
          "Pago recibido para una venta anulada. Requiere revisión.",
        );
      if (s.paid === 0) {
        statements.push(
          insert("payments", {
            id: uuid(),
            org,
            sale_id: s.id,
            amount: t.amount_in_cents,
            method: "wompi",
            reference: t.id,
            created_at: now(),
            idempotency_key: "wompi-" + t.id,
          }),
          statement(
            "UPDATE sales SET status='completed',external_id=? WHERE id=? AND org=?",
            t.id,
            s.id,
            org,
          ),
        );
      }
    } // Declines remain pending so the merchant may retry or cancel; approved payments never regress.
    await database().batch(statements);
    return { ok: true };
  }
  const signature =
    request.headers.get(
      provider === "shopify"
        ? "x-shopify-hmac-sha256"
        : "x-wc-webhook-signature",
    ) || "";
  if (!equal(await hmacBase64(c.secret, raw), signature))
    throw new ApiError(401, "Firma no válida");
  if (
    provider === "shopify" &&
    request.headers.get("x-shopify-shop-domain") !== c.shopDomain
  )
    throw new ApiError(401, "Tienda incorrecta");
  if (
    provider === "shopify" &&
    request.headers.get("x-shopify-topic") !== "orders/paid"
  )
    return { ignored: true };
  if (
    provider === "woocommerce" &&
    !["processing", "completed"].includes(body.status)
  )
    return { ignored: true };
  if (provider === "shopify" && body.financial_status !== "paid")
    throw new ApiError(400, "La orden no está pagada");
  if (body.currency !== "COP") throw new ApiError(400, "Solo se admite COP");
  const eventId = provider + "-" + body.id;
  const products = await all(
    "SELECT * FROM products WHERE org=? AND active=1",
    org,
  );
  if (
    !Array.isArray(body.line_items) ||
    body.line_items.length < 1 ||
    body.line_items.length > 100
  )
    throw new ApiError(400, "Líneas no válidas");
  const lines = body.line_items.map((i: any) => {
    const p = products.find((p) => p.sku === i.sku);
    if (!p)
      throw new ApiError(422, "SKU sin mapear: " + String(i.sku).slice(0, 60));
    const q = z.number().int().positive().max(100000).parse(i.quantity);
    let subtotal, total, tax;
    if (provider === "woocommerce") {
      subtotal = Math.round(Number(i.total) * 100);
      tax = Math.round(Number(i.total_tax) * 100);
      total = subtotal + tax;
    } else {
      const discount = (i.discount_allocations || []).reduce(
        (a: number, d: any) => a + Math.round(Number(d.amount) * 100),
        0,
      );
      const base = Math.round(Number(i.price) * 100) * q - discount;
      tax = (i.tax_lines || []).reduce(
        (a: number, t: any) => a + Math.round(Number(t.price) * 100),
        0,
      );
      total = body.taxes_included ? base : base + tax;
      subtotal = total - tax;
    }
    if (
      ![total, subtotal, tax].every(Number.isSafeInteger) ||
      subtotal < 0 ||
      tax < 0 ||
      total <= 0
    )
      throw new ApiError(400, "Importes de línea no válidos");
    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      quantity: q,
      unitPrice: Math.round(total / q),
      unitCost: p.cost,
      taxRate: p.tax_rate,
      subtotal,
      tax,
      total,
    };
  });
  const expected = Math.round(
    Number(provider === "shopify" ? body.total_price : body.total) * 100,
  );
  if (lines.reduce((a: number, l: Row) => a + l.total, 0) !== expected)
    throw new ApiError(
      422,
      "La orden incluye envío, propinas o ajustes sin mapear. Importa los conceptos antes de reintentar.",
    );
  const organization = await first(
    "SELECT owner,demo FROM organizations WHERE id=?",
    org,
  );
  return createSale(
    { org, actor: provider, demo: Boolean(organization?.demo) },
    {
      locationId: c.locationId,
      channel: "online",
      paymentMethod: "transfer",
      items: lines.map((l: Row) => ({
        productId: l.productId,
        quantity: l.quantity,
      })),
      idempotencyKey: eventId,
      note: "Importado de " + provider,
    },
    { externalId: String(body.id), lines, provider, eventId },
  );
}
export async function issueInvoice(ctx: Context, id: string, raw: any) {
  const sale = await owned("sales", id, ctx.org);
  if (sale.status !== "completed")
    throw new ApiError(400, "Solo se facturan ventas completadas");
  if (sale.invoice_status === "validated")
    return { reference: sale.invoice_reference };
  const c = await getConfig(ctx.org, "factus");
  const fiscal = z
    .object({
      identification_document_code: z.enum(["13", "22", "31", "42", "50"]),
      identification: z.string().min(3).max(30),
      names: z.string().min(2).max(150),
      company: z.string().max(150).optional(),
      address: z.string().min(3).max(150),
      email: z.email(),
      phone: z.string().min(7).max(30),
      legal_organization_code: z.enum(["1", "2"]),
      tribute_code: z.string().min(1).max(10),
      municipality_code: z.string().regex(/^\d{5}$/),
      responsibilities: z.array(z.string().min(1)).min(1),
      dv: z.string().max(1).optional(),
    })
    .parse(raw.customer);
  if (raw.confirm !== true)
    throw new ApiError(400, "Revisa y confirma los datos fiscales");
  const items = await all(
    "SELECT * FROM sale_items WHERE sale_id=? AND org=?",
    id,
    ctx.org,
  );
  const payload = {
    reference_code: sale.id,
    document: "01",
    operation_type: "10",
    numbering_range_id: c.numberingRange,
    send_email: false,
    customer: { ...fiscal, country_code: "CO" },
    payment_details: [
      {
        payment_form: sale.payment_method === "credit" ? "2" : "1",
        payment_method_code:
          sale.payment_method === "cash"
            ? "10"
            : sale.payment_method === "card"
              ? "49"
              : "47",
        amount: (sale.total / 100).toFixed(2),
        ...(sale.due_date ? { due_date: sale.due_date } : {}),
      },
    ],
    items: items.map((i) => ({
      code_reference: i.sku,
      name: i.name,
      quantity: String(i.quantity),
      price: (i.subtotal / i.quantity / 100).toFixed(2),
      unit_measure_code: "94",
      standard_code: "999",
      taxes: [
        {
          code: "01",
          rate: i.tax_rate.toFixed(2),
          ...(i.tax_rate === 0
            ? { is_excluded: raw.zeroTaxExcluded === true }
            : {}),
        },
      ],
    })),
  };
  if (raw.preview === true) return { payload };
  const root =
    c.environment === "production"
      ? "https://api.factus.com.co"
      : "https://api-sandbox.factus.com.co";
  const auth = await fetch(root + "/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: c.clientId,
      client_secret: c.clientSecret,
      username: c.username,
      password: c.password,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!auth.ok) throw new ApiError(502, "Factus rechazó las credenciales");
  const token = ((await auth.json()) as any).access_token;
  const response = await fetch(root + "/v2/bills/validate", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const result = (await response.json()) as any;
  const valid =
    response.ok && result.data?.is_validated === true && result.data?.cufe;
  await database().batch([
    statement(
      "UPDATE sales SET invoice_status=?,invoice_reference=? WHERE id=? AND org=?",
      valid ? "validated" : "error",
      valid
        ? JSON.stringify({
            number: result.data.number,
            cufe: result.data.cufe,
            environment: c.environment,
          })
        : null,
      id,
      ctx.org,
    ),
    insert("audit", {
      id: uuid(),
      org: ctx.org,
      actor: ctx.actor,
      action: valid ? "Factura validada" : "Error de facturación",
      reference: sale.number,
      created_at: now(),
    }),
  ]);
  if (!valid)
    throw new ApiError(
      422,
      "Factus no validó la factura. Revisa los datos fiscales y el rango en Factus antes de reintentar.",
    );
  return { number: result.data.number, cufe: result.data.cufe };
}
