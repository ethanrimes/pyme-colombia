import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/sqlite-core";
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  nit: text("nit").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default("Bogotá"),
  demo: integer("demo").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
export const locations = sqliteTable(
  "locations",
  {
    id: text("id").primaryKey(),
    org: text("org")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("locations_org_name").on(t.org, t.name)],
);
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    org: text("org")
      .notNull()
      .references(() => organizations.id),
    sku: text("sku").notNull(),
    barcode: text("barcode").notNull().default(""),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unit: text("unit").notNull().default("und"),
    cost: integer("cost").notNull(),
    price: integer("price").notNull(),
    wholesalePrice: integer("wholesale_price").notNull(),
    wholesaleMin: integer("wholesale_min").notNull().default(6),
    taxRate: integer("tax_rate").notNull().default(19),
    minStock: integer("min_stock").notNull().default(10),
    active: integer("active").notNull().default(1),
  },
  (t) => [
    uniqueIndex("products_org_sku").on(t.org, t.sku),
    check(
      "product_money",
      sql`${t.cost}>=0 AND ${t.price}>=0 AND ${t.wholesalePrice}>=0`,
    ),
  ],
);
export const stock = sqliteTable(
  "stock",
  {
    org: text("org").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: integer("quantity").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.locationId] }),
    index("stock_org").on(t.org),
    check("stock_nonnegative", sql`${t.quantity}>=0`),
  ],
);
export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    org: text("org")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    document: text("document").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    kind: text("kind").notNull(),
    city: text("city").notNull().default("Bogotá"),
  },
  (t) => [index("contacts_org").on(t.org)],
);
export const sales = sqliteTable(
  "sales",
  {
    id: text("id").primaryKey(),
    org: text("org")
      .notNull()
      .references(() => organizations.id),
    number: text("number").notNull(),
    locationId: text("location_id").notNull(),
    customerId: text("customer_id"),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    paymentMethod: text("payment_method").notNull(),
    subtotal: integer("subtotal").notNull(),
    tax: integer("tax").notNull(),
    total: integer("total").notNull(),
    cost: integer("cost").notNull(),
    paid: integer("paid").notNull().default(0),
    createdAt: text("created_at").notNull(),
    dueDate: text("due_date"),
    idempotencyKey: text("idempotency_key").notNull(),
    externalId: text("external_id"),
    invoiceStatus: text("invoice_status").notNull().default("not_issued"),
    invoiceReference: text("invoice_reference"),
    note: text("note").notNull().default(""),
  },
  (t) => [
    uniqueIndex("sales_org_idempotency").on(t.org, t.idempotencyKey),
    uniqueIndex("sales_org_number").on(t.org, t.number),
    index("sales_org_date").on(t.org, t.createdAt),
    check("sales_paid_valid", sql`${t.paid}>=0 AND ${t.paid}<=${t.total}`),
  ],
);
export const saleItems = sqliteTable(
  "sale_items",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    saleId: text("sale_id")
      .notNull()
      .references(() => sales.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    unitCost: integer("unit_cost").notNull(),
    taxRate: integer("tax_rate").notNull(),
    subtotal: integer("subtotal").notNull(),
    tax: integer("tax").notNull(),
    total: integer("total").notNull(),
  },
  (t) => [
    index("sale_items_sale").on(t.saleId),
    check("sale_quantity_positive", sql`${t.quantity}>0`),
  ],
);
export const movements = sqliteTable(
  "movements",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    locationId: text("location_id").notNull(),
    quantity: integer("quantity").notNull(),
    unitCost: integer("unit_cost").notNull(),
    kind: text("kind").notNull(),
    reference: text("reference").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("movements_org_date").on(t.org, t.createdAt),
    index("movements_product_date").on(t.org, t.productId, t.createdAt),
  ],
);
export const purchases = sqliteTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    number: text("number").notNull(),
    supplierId: text("supplier_id").notNull(),
    locationId: text("location_id").notNull(),
    status: text("status").notNull(),
    subtotal: integer("subtotal").notNull().default(0),
    tax: integer("tax").notNull().default(0),
    total: integer("total").notNull(),
    paid: integer("paid").notNull().default(0),
    createdAt: text("created_at").notNull(),
    dueDate: text("due_date"),
    receivedAt: text("received_at"),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    uniqueIndex("purchases_org_key").on(t.org, t.idempotencyKey),
    index("purchases_org_date").on(t.org, t.createdAt),
    check("purchase_paid_valid", sql`${t.paid}>=0 AND ${t.paid}<=${t.total}`),
  ],
);
export const purchaseItems = sqliteTable(
  "purchase_items",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => purchases.id),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    unitCost: integer("unit_cost").notNull(),
    taxRate: integer("tax_rate").notNull().default(0),
    tax: integer("tax").notNull().default(0),
  },
  (t) => [
    index("purchase_items_purchase").on(t.purchaseId),
    check(
      "purchase_quantity_positive",
      sql`${t.quantity}>0 AND ${t.unitCost}>=0`,
    ),
  ],
);
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    saleId: text("sale_id"),
    purchaseId: text("purchase_id"),
    amount: integer("amount").notNull(),
    method: text("method").notNull(),
    reference: text("reference").notNull(),
    createdAt: text("created_at").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    uniqueIndex("payments_org_key").on(t.org, t.idempotencyKey),
    index("payments_org_date").on(t.org, t.createdAt),
    check("payment_positive", sql`${t.amount}>0`),
  ],
);
export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    amount: integer("amount").notNull(),
    method: text("method").notNull(),
    createdAt: text("created_at").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    uniqueIndex("expenses_org_key").on(t.org, t.idempotencyKey),
    check("expense_positive", sql`${t.amount}>0`),
  ],
);
export const bankEntries = sqliteTable(
  "bank_entries",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    externalId: text("external_id").notNull(),
    date: text("date").notNull(),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    paymentId: text("payment_id"),
  },
  (t) => [
    uniqueIndex("bank_org_external").on(t.org, t.externalId),
    uniqueIndex("bank_payment").on(t.paymentId),
  ],
);
export const integrations = sqliteTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    provider: text("provider").notNull(),
    config: text("config").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("integrations_org_provider").on(t.org, t.provider)],
);
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    status: text("status").notNull(),
    message: text("message").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("events_org_provider_external").on(
      t.org,
      t.provider,
      t.externalId,
    ),
  ],
);
export const audit = sqliteTable(
  "audit",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    reference: text("reference").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("audit_org_date").on(t.org, t.createdAt)],
);
export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    saleId: text("sale_id").notNull(),
    amount: integer("amount").notNull(),
    method: text("method").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("refunds_sale").on(t.saleId)],
);
export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    org: text("org").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revoked: integer("revoked").notNull().default(0),
  },
  (t) => [
    uniqueIndex("devices_token").on(t.tokenHash),
    index("devices_org").on(t.org),
  ],
);
