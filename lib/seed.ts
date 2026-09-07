import { database, insert, now, uuid } from "./database";
import { priceLines } from "./domain";
const catalog = [
  ["CAF-001", "Café de origen 500 g", "Alimentos", 14900, 24900, 21900, 19],
  ["CHO-002", "Chocolate de mesa 250 g", "Alimentos", 6800, 12800, 10500, 19],
  ["ACE-003", "Aceite de oliva 500 ml", "Despensa", 21400, 32500, 28500, 19],
  ["ARR-004", "Arroz premium 1 kg", "Despensa", 3200, 5800, 4900, 5],
  ["PAN-005", "Panela orgánica 500 g", "Alimentos", 2300, 4500, 3800, 0],
  ["PAS-006", "Pasta artesanal 500 g", "Despensa", 4200, 8900, 7200, 5],
  ["MIE-007", "Miel de abejas 350 g", "Alimentos", 12600, 22500, 19000, 19],
  ["GAL-008", "Galletas de avena", "Alimentos", 3100, 6500, 5200, 19],
  ["JAB-009", "Jabón líquido 500 ml", "Hogar", 6400, 12900, 10800, 19],
  ["DET-010", "Detergente 1 kg", "Hogar", 8900, 18500, 15500, 19],
  ["AGU-011", "Agua mineral 600 ml", "Bebidas", 1100, 2800, 2200, 19],
  ["JUG-012", "Jugo de mango 1 L", "Bebidas", 3700, 7900, 6500, 19],
  ["SAL-013", "Sal marina 500 g", "Despensa", 1800, 4200, 3500, 0],
  ["TE-014", "Té de hierbas · 20 sobres", "Bebidas", 4800, 10900, 8900, 19],
  ["AVE-015", "Avena en hojuelas 500 g", "Alimentos", 2900, 6200, 5100, 5],
  ["SER-016", "Servilletas · 100 unidades", "Hogar", 2100, 4900, 3900, 19],
];
export async function seedOrganization(
  org: string,
  owner: string,
  demo: boolean,
) {
  const timestamp = now();
  const loc = org + "-store",
    warehouse = org + "-warehouse";
  const rows = [
    insert("organizations", {
      id: org,
      owner,
      name: demo ? "Mercado La Esquina" : "Mi negocio",
      nit: "",
      city: "Bogotá",
      demo: demo ? 1 : 0,
      created_at: timestamp,
    }),
    insert("locations", { id: loc, org, name: "Tienda principal" }),
    insert("locations", { id: warehouse, org, name: "Bodega central" }),
  ];
  if (demo) {
    const products = catalog.map(
      ([sku, name, category, cost, price, wholesale, tax], i) => ({
        id: org + "-p" + i,
        org,
        sku,
        name,
        category,
        cost: Number(cost) * 100,
        price: Number(price) * 100,
        wholesale_price: Number(wholesale) * 100,
        tax_rate: Number(tax),
        wholesale_min: 6,
        min_stock: 12,
        active: 1,
        barcode: "7700000" + String(i + 1).padStart(6, "0"),
      }),
    );
    for (const p of products) {
      rows.push(insert("products", p));
      for (const location of [loc, warehouse])
        rows.push(
          insert("movements", {
            id: uuid(),
            org,
            product_id: p.id,
            location_id: location,
            quantity: location === loc ? 260 : 120,
            unit_cost: p.cost,
            kind: "opening",
            reference: "demo-opening",
            note: "Saldo inicial de demostración",
            created_at: new Date(Date.now() - 61 * 864e5).toISOString(),
          }),
        );
    }
    const customers = [
      "Tienda Doña Luz",
      "Distribuciones Andina",
      "Laura Martínez",
      "Carlos Rodríguez",
      "Café del Parque",
      "Minimercado El Sol",
    ];
    customers.forEach((name, i) =>
      rows.push(
        insert("contacts", {
          id: org + "-c" + i,
          org,
          name,
          kind: "customer",
          city: i % 2 ? "Medellín" : "Bogotá",
          phone: "",
          document: "",
          email: "",
        }),
      ),
    );
    [
      "Caficultores del Huila",
      "Distribuidora Nacional",
      "Productos de la Sabana",
    ].forEach((name, i) =>
      rows.push(
        insert("contacts", {
          id: org + "-s" + i,
          org,
          name,
          kind: "supplier",
          city: "Bogotá",
        }),
      ),
    );
    for (let n = 0; n < 84; n++) {
      const channel =
        n % 5 === 0 ? "wholesale" : n % 4 === 0 ? "online" : "pos";
      const p = n % 16;
      const ordered = [
        {
          productId: products[p].id,
          quantity: channel === "wholesale" ? 8 + (n % 4) * 2 : 1 + (n % 3),
        },
        {
          productId: products[p === 0 ? 1 : (p + 3) % 16].id,
          quantity: channel === "wholesale" ? 6 : 1,
        },
      ];
      const lines = priceLines(products, ordered, channel);
      const at = new Date(
        Date.now() - Math.floor(n / 2) * 864e5 - (n % 2) * 5 * 36e5,
      ).toISOString();
      const id = org + "-sale" + n;
      const total = lines.reduce((a, b) => a + b.total, 0);
      const method =
        n % 9 === 0
          ? "credit"
          : n % 3 === 0
            ? "transfer"
            : n % 2 === 0
              ? "card"
              : "cash";
      rows.push(
        insert("sales", {
          id,
          org,
          number: "NV-" + String(1084 - n),
          location_id: loc,
          customer_id: org + "-c" + (n % 6),
          channel,
          status: "completed",
          payment_method: method,
          subtotal: lines.reduce((a, b) => a + b.subtotal, 0),
          tax: lines.reduce((a, b) => a + b.tax, 0),
          total,
          cost: lines.reduce((a, b) => a + b.unitCost * b.quantity, 0),
          paid: 0,
          created_at: at,
          due_date:
            method === "credit"
              ? new Date(Date.now() + ((n % 3) - 1) * 7 * 864e5)
                  .toISOString()
                  .slice(0, 10)
              : null,
          idempotency_key: "seed-" + n,
          note: "Venta de demostración",
        }),
      );
      for (const line of lines)
        rows.push(
          insert("sale_items", {
            id: uuid(),
            org,
            sale_id: id,
            product_id: line.productId,
            name: line.name,
            sku: line.sku,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            unit_cost: line.unitCost,
            tax_rate: line.taxRate,
            subtotal: line.subtotal,
            tax: line.tax,
            total: line.total,
          }),
        );
      if (method !== "credit")
        rows.push(
          insert("payments", {
            id: uuid(),
            org,
            sale_id: id,
            amount: total,
            method,
            reference: "Demo " + (1084 - n),
            created_at: at,
            idempotency_key: "seed-pay-" + n,
          }),
        );
    }
    for (let i = 0; i < 3; i++)
      rows.push(
        insert("movements", {
          id: uuid(),
          org,
          product_id: products[i + 2].id,
          location_id: warehouse,
          quantity: -112,
          unit_cost: products[i + 2].cost,
          kind: "adjustment",
          reference: "demo-adjustment-" + i,
          note: "Ajuste de demostración",
          created_at: timestamp,
        }),
      );
    [
      ["Arriendo del local", "Arriendo", 1850000],
      ["Servicios públicos", "Servicios", 385000],
      ["Envíos a clientes", "Logística", 124000],
      ["Campaña redes sociales", "Marketing", 250000],
      ["Papelería e insumos", "Operación", 89000],
    ].forEach(([description, category, amount], i) =>
      rows.push(
        insert("expenses", {
          id: uuid(),
          org,
          description,
          category,
          amount: Number(amount) * 100,
          method: "transfer",
          created_at: new Date(Date.now() - i * 864e5).toISOString(),
          idempotency_key: "seed-exp-" + i,
        }),
      ),
    );
  }
  await database().batch(rows);
}
