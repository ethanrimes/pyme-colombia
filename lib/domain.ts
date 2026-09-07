import { z } from "zod";
export const money = (cents: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
export const number = (n: number) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(n);
export const bogotaDate = (date: Date | string = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
export const cents = (pesos: unknown) => {
  const n = Number(pesos);
  if (!Number.isFinite(n) || Math.abs(n) > 1e11)
    throw new Error("Monto no válido");
  return Math.round(n * 100);
};
export const identifier = z.string().min(1).max(150);
const integer = z.number().int().min(0).max(1e13);
export const productInput = z.object({
  sku: z.string().trim().min(1).max(60),
  barcode: z.string().trim().max(80).default(""),
  name: z.string().trim().min(2).max(150),
  category: z.string().trim().min(1).max(60),
  unit: z.string().max(20).default("und"),
  cost: integer,
  price: integer,
  wholesalePrice: integer,
  wholesaleMin: z.number().int().min(1).max(100000).default(6),
  taxRate: z.union([z.literal(0), z.literal(5), z.literal(19)]),
  minStock: integer.max(100000),
});
export const contactInput = z.object({
  name: z.string().trim().min(2).max(150),
  document: z.string().max(30).default(""),
  email: z.union([z.literal(""), z.email()]).default(""),
  phone: z.string().max(30).default(""),
  kind: z.enum(["customer", "supplier"]),
  city: z.string().max(80).default("Bogotá"),
});
export const saleInput = z
  .object({
    locationId: identifier,
    customerId: identifier.nullable().default(null),
    channel: z.enum(["pos", "wholesale", "online"]),
    paymentMethod: z.enum(["cash", "card", "transfer", "credit", "wompi"]),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    items: z
      .array(
        z.object({
          productId: identifier,
          quantity: z.number().int().min(1).max(100000),
        }),
      )
      .min(1)
      .max(100),
    idempotencyKey: identifier,
    note: z.string().max(500).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.paymentMethod === "credit" && (!v.customerId || !v.dueDate))
      ctx.addIssue({
        code: "custom",
        message: "Selecciona cliente y vencimiento para vender a crédito",
      });
    if (v.paymentMethod === "wompi" && v.channel !== "online")
      ctx.addIssue({
        code: "custom",
        message: "Wompi requiere el canal online",
      });
  });
export function priceLines(
  products: Record<string, unknown>[],
  items: { productId: string; quantity: number }[],
  channel: string,
) {
  const merged = new Map<string, number>();
  for (const i of items)
    merged.set(i.productId, (merged.get(i.productId) || 0) + i.quantity);
  return [...merged].map(([id, quantity]) => {
    const p = products.find((p) => p.id === id);
    if (!p || !p.active) throw new Error("Producto no disponible");
    if (quantity > 100000) throw new Error("Cantidad fuera de rango");
    const unitPrice = Number(
      channel === "wholesale" && quantity >= Number(p.wholesale_min)
        ? p.wholesale_price
        : p.price,
    );
    const total = unitPrice * quantity;
    const subtotal = Math.round((total * 100) / (100 + Number(p.tax_rate)));
    return {
      productId: id,
      name: String(p.name),
      sku: String(p.sku),
      quantity,
      unitPrice,
      unitCost: Number(p.cost),
      taxRate: Number(p.tax_rate),
      subtotal,
      tax: total - subtotal,
      total,
    };
  });
}
export function safeCsvCell(value: unknown) {
  const s = String(value ?? "");
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
export const purchaseInput = z.object({
  supplierId: identifier,
  locationId: identifier,
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  idempotencyKey: identifier,
  items: z
    .array(
      z.object({
        productId: identifier,
        quantity: z.number().int().min(1).max(100000),
        unitCost: integer,
        taxRate: z
          .union([z.literal(0), z.literal(5), z.literal(19)])
          .default(0),
      }),
    )
    .min(1)
    .max(100),
});
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Row = Record<string, any>; // SQL rows are validated at the boundary; aliases vary per query.
export type Snapshot = {
  org: Row;
  locations: Row[];
  products: Row[];
  stock: Row[];
  contacts: Row[];
  sales: Row[];
  items: Row[];
  purchases: Row[];
  purchaseItems: Row[];
  payments: Row[];
  expenses: Row[];
  movements: Row[];
  bank: Row[];
  integrations: Row[];
  events: Row[];
  audit: Row[];
  refunds: Row[];
  devices: Row[];
};
