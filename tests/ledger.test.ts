import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { env } from "./runtime";
import { createSale, mutate, snapshot } from "../lib/service";
import { seedOrganization } from "../lib/seed";
import { importCsv } from "../lib/imports";
let db: DatabaseSync;
class Prepared {
  constructor(
    public sql: string,
    public args: any[] = [],
  ) {}
  bind(...args: any[]) {
    return new Prepared(this.sql, args);
  }
  async all() {
    return { results: db.prepare(this.sql).all(...this.args) };
  }
  async first() {
    return db.prepare(this.sql).get(...this.args) || null;
  }
  async run() {
    return { meta: db.prepare(this.sql).run(...this.args) };
  }
}
const ctx = { org: "test-org", actor: "owner", demo: false };
let location: string, product: string;
beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("drizzle/" + f, "utf8"));
  env.DB = {
    prepare: (s: string) => new Prepared(s),
    batch: async (statements: Prepared[]) => {
      db.exec("BEGIN");
      try {
        const r = [];
        for (const s of statements) {
          const st = db.prepare(s.sql);
          r.push({ results: st.all(...s.args) });
        }
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  await seedOrganization(ctx.org, ctx.actor, false);
  location = ctx.org + "-store";
  product = (
    await mutate(ctx, ["products"], {
      sku: "CAF",
      name: "Café",
      category: "Alimentos",
      cost: 10000,
      price: 23800,
      wholesalePrice: 17850,
      wholesaleMin: 6,
      taxRate: 19,
      minStock: 5,
    })
  ).id;
  await mutate(ctx, ["inventory"], {
    productId: product,
    locationId: location,
    quantity: 10,
    note: "Inventario inicial",
    idempotencyKey: "opening",
  });
});
afterEach(() => db.close());
const sale = (key = "sale", qty = 2, method = "cash") => ({
  locationId: location,
  channel: "pos",
  paymentMethod: method,
  items: [{ productId: product, quantity: qty }],
  idempotencyKey: key,
});
describe("Atomic retail ledger", () => {
  it("calculates inclusive VAT, COGS, payment and stock together", async () => {
    const s = await createSale(ctx, sale());
    expect(s.total).toBe(47600);
    expect(s.subtotal).toBe(40000);
    expect(s.tax).toBe(7600);
    expect(s.cost).toBe(20000);
    expect(s.paid).toBe(47600);
    expect((await snapshot(ctx.org)).stock[0].quantity).toBe(8);
  });
  it("retries a sale without duplicating inventory or payment", async () => {
    const a = await createSale(ctx, sale());
    const b = await createSale(ctx, sale());
    expect(a.id).toBe(b.id);
    const d = await snapshot(ctx.org);
    expect(d.sales).toHaveLength(1);
    expect(d.payments).toHaveLength(1);
    expect(d.stock[0].quantity).toBe(8);
  });
  it("rolls back the entire sale when inventory is insufficient", async () => {
    await expect(createSale(ctx, sale("oversell", 11))).rejects.toThrow(
      "Stock insuficiente",
    );
    const d = await snapshot(ctx.org);
    expect(d.sales).toHaveLength(0);
    expect(d.items).toHaveLength(0);
    expect(d.payments).toHaveLength(0);
    expect(d.stock[0].quantity).toBe(10);
  });
  it("merges duplicate lines before applying wholesale minimums", async () => {
    const s = await createSale(ctx, {
      ...sale(),
      channel: "wholesale",
      items: [
        { productId: product, quantity: 3 },
        { productId: product, quantity: 3 },
      ],
    });
    expect(s.total).toBe(17850 * 6);
    expect((await snapshot(ctx.org)).items).toHaveLength(1);
  });
  it("rejects cross-business stock, locations and customer references", async () => {
    await seedOrganization("other", "other-owner", false);
    await expect(
      createSale(ctx, { ...sale(), locationId: "other-store" }),
    ).rejects.toThrow("Registro no encontrado");
    await expect(createSale({ ...ctx, org: "other" }, sale())).rejects.toThrow(
      "Registro no encontrado",
    );
  });
  it("requires customer and due date for credit", async () => {
    await expect(
      createSale(ctx, sale("credit", 2, "credit")),
    ).rejects.toThrow();
  });
  it("records credit payments and rejects overpayment", async () => {
    const c = await mutate(ctx, ["contacts"], {
      name: "Cliente Uno",
      kind: "customer",
    });
    const s = await createSale(ctx, {
      ...sale("credit", 2, "credit"),
      customerId: c.id,
      dueDate: "2026-10-01",
    });
    expect(s.paid).toBe(0);
    await mutate(ctx, ["payments"], {
      saleId: s.id,
      amount: 20000,
      method: "cash",
      reference: "Abono",
      idempotencyKey: "pay",
    });
    await expect(
      mutate(ctx, ["payments"], {
        saleId: s.id,
        amount: 30000,
        method: "cash",
        reference: "Abono",
        idempotencyKey: "pay2",
      }),
    ).rejects.toThrow("supera");
    expect((await snapshot(ctx.org)).sales[0].paid).toBe(20000);
  });
  it("returns stock and records a refund once", async () => {
    const s = await createSale(ctx, sale());
    await mutate(ctx, ["sales", s.id, "void"], { confirm: true });
    await mutate(ctx, ["sales", s.id, "void"], { confirm: true });
    const d = await snapshot(ctx.org);
    expect(d.stock[0].quantity).toBe(10);
    expect(d.refunds).toHaveLength(1);
    expect(d.refunds[0].amount).toBe(47600);
  });
  it("receives a purchase exactly once and updates weighted average cost", async () => {
    const c = await mutate(ctx, ["contacts"], {
      name: "Proveedor",
      kind: "supplier",
    });
    const p = await mutate(ctx, ["purchases"], {
      supplierId: c.id,
      locationId: location,
      items: [{ productId: product, quantity: 10, unitCost: 20000 }],
      idempotencyKey: "purchase",
    });
    await mutate(ctx, ["purchases", p.id, "receive"], {});
    await mutate(ctx, ["purchases", p.id, "receive"], {});
    const d = await snapshot(ctx.org);
    expect(d.stock[0].quantity).toBe(20);
    expect(d.products[0].cost).toBe(15000);
  });
  it("transfers atomically and rejects insufficient stock", async () => {
    await mutate(ctx, ["inventory"], {
      productId: product,
      locationId: location,
      toLocationId: ctx.org + "-warehouse",
      quantity: 4,
      note: "Traslado",
      idempotencyKey: "transfer",
    });
    await expect(
      mutate(ctx, ["inventory"], {
        productId: product,
        locationId: location,
        toLocationId: ctx.org + "-warehouse",
        quantity: 20,
        note: "Traslado",
        idempotencyKey: "bad-transfer",
      }),
    ).rejects.toThrow();
    const d = await snapshot(ctx.org);
    expect(d.stock.reduce((a, s) => a + s.quantity, 0)).toBe(10);
    expect(d.stock.find((s) => s.location_id === location)!.quantity).toBe(6);
  });
  it("does not mark an unconfirmed online payment as revenue", async () => {
    const s = await createSale(ctx, {
      ...sale("wompi", 2, "wompi"),
      channel: "online",
    });
    expect(s.status).toBe("pending");
    expect(s.paid).toBe(0);
    expect((await snapshot(ctx.org)).stock[0].quantity).toBe(8);
  });
  it("previews CSV imports and rejects all rows when one is invalid", async () => {
    const csv =
      "sku,nombre,categoria,costo,precio,precio_mayorista,iva\nNEW,Nuevo,Alimentos,100,200,150,19\nBAD,Producto,Alimentos,abc,200,150,19";
    const result = await importCsv(ctx, "products", { csv });
    expect(result.valid).toBe(false);
    expect((await snapshot(ctx.org)).products).toHaveLength(1);
    const good = "id,fecha,descripcion,monto\nB1,2026-09-01,Pago,238";
    expect(
      (await importCsv(ctx, "bank", { csv: good, preview: true })).count,
    ).toBe(1);
    expect((await snapshot(ctx.org)).bank).toHaveLength(0);
    await importCsv(ctx, "bank", { csv: good });
    await importCsv(ctx, "bank", { csv: good });
    expect((await snapshot(ctx.org)).bank).toHaveLength(1);
  });
});

describe("Purchasing and integration boundaries", () => {
  it("keeps recoverable purchase VAT out of weighted inventory cost", async () => {
    const supplier = await mutate(ctx, ["contacts"], {
      name: "Proveedor IVA",
      kind: "supplier",
    });
    const p = await mutate(ctx, ["purchases"], {
      supplierId: supplier.id,
      locationId: location,
      idempotencyKey: "tax-purchase",
      items: [
        { productId: product, quantity: 10, unitCost: 20000, taxRate: 19 },
      ],
    });
    await mutate(ctx, ["purchases", p.id, "receive"], {});
    const d = await snapshot(ctx.org);
    expect(d.purchases[0].subtotal).toBe(200000);
    expect(d.purchases[0].tax).toBe(38000);
    expect(d.purchases[0].total).toBe(238000);
    expect(d.products[0].cost).toBe(15000);
  });
  it("settles a verified Wompi payment once and preserves the stock reservation", async () => {
    const { saveConfig, webhook } = await import("../lib/integrations");
    const { sha256 } = await import("../lib/crypto");
    env.INTEGRATION_ENCRYPTION_KEY = btoa("a".repeat(32));
    await saveConfig(ctx, "wompi", {
      environment: "sandbox",
      publicKey: "test_public_key",
      privateKey: "test_private_key",
      integritySecret: "test_integrity_key",
      eventsSecret: "test_events_key",
    });
    const saleRow = await createSale(ctx, {
      ...sale("online", 2, "wompi"),
      channel: "online",
    });
    const transaction = {
      id: "gateway-1",
      status: "APPROVED",
      amount_in_cents: saleRow.total,
      reference: saleRow.id,
      currency: "COP",
    };
    const event = {
      event: "transaction.updated",
      environment: "test",
      data: { transaction },
      timestamp: 123456,
      signature: {
        properties: [
          "transaction.id",
          "transaction.status",
          "transaction.amount_in_cents",
        ],
        checksum: await sha256(
          "gateway-1APPROVED" + saleRow.total + "123456test_events_key",
        ),
      },
    };
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ data: transaction });
    try {
      await webhook(
        "wompi",
        ctx.org,
        new Request("https://local/webhook", {
          method: "POST",
          body: JSON.stringify(event),
        }),
      );
      await webhook(
        "wompi",
        ctx.org,
        new Request("https://local/webhook", {
          method: "POST",
          body: JSON.stringify(event),
        }),
      );
    } finally {
      globalThis.fetch = original;
    }
    const d = await snapshot(ctx.org);
    expect(d.sales[0].status).toBe("completed");
    expect(d.sales[0].paid).toBe(saleRow.total);
    expect(d.payments).toHaveLength(1);
    expect(d.stock[0].quantity).toBe(8);
    expect(d.integrations[0]).not.toHaveProperty("config");
  });
  it("rejects Shopify events from the wrong store and deduplicates paid orders", async () => {
    const { saveConfig, webhook } = await import("../lib/integrations");
    const { hmacBase64 } = await import("../lib/crypto");
    env.INTEGRATION_ENCRYPTION_KEY = btoa("a".repeat(32));
    await saveConfig(ctx, "shopify", {
      secret: "test_shopify_secret",
      shopDomain: "nexo-test.myshopify.com",
      locationId: location,
    });
    const raw = JSON.stringify({
      id: 123,
      financial_status: "paid",
      currency: "COP",
      total_price: "238.00",
      taxes_included: true,
      line_items: [
        {
          sku: "CAF",
          quantity: 1,
          price: "238.00",
          tax_lines: [{ price: "38.00" }],
        },
      ],
    });
    const headers = {
      "x-shopify-hmac-sha256": await hmacBase64("test_shopify_secret", raw),
      "x-shopify-topic": "orders/paid",
      "x-shopify-shop-domain": "another.myshopify.com",
    };
    await expect(
      webhook(
        "shopify",
        ctx.org,
        new Request("https://local/hook", {
          method: "POST",
          headers,
          body: raw,
        }),
      ),
    ).rejects.toThrow("Tienda incorrecta");
    headers["x-shopify-shop-domain"] = "nexo-test.myshopify.com";
    await webhook(
      "shopify",
      ctx.org,
      new Request("https://local/hook", { method: "POST", headers, body: raw }),
    );
    await webhook(
      "shopify",
      ctx.org,
      new Request("https://local/hook", { method: "POST", headers, body: raw }),
    );
    expect((await snapshot(ctx.org)).sales).toHaveLength(1);
    expect((await snapshot(ctx.org)).stock[0].quantity).toBe(9);
  });
  it("does not match an incoming bank amount with an outgoing supplier payment", async () => {
    await createSale(ctx, sale());
    await importCsv(ctx, "bank", {
      csv: "id,fecha,descripcion,monto\nBANK,2026-09-01,Salida,-476",
    });
    const d = await snapshot(ctx.org);
    await expect(
      mutate(ctx, ["bank", d.bank[0].id, "match"], {
        paymentId: d.payments[0].id,
      }),
    ).rejects.toThrow("no coinciden");
  });
  it("counts uninitialized stock as zero for replenishment alerts", async () => {
    const { analyze } = await import("../lib/analytics");
    const d = await snapshot(ctx.org);
    const a = analyze(d, "2026-01-01", "2027-01-01");
    expect(
      a.low.some(
        (l) => l.location_id === ctx.org + "-warehouse" && l.quantity === 0,
      ),
    ).toBe(true);
  });
});
