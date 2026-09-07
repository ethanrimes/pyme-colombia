import { bogotaDate, type Snapshot, type Row } from "./domain";
export function dateRange(period: string) {
  const end = bogotaDate();
  const today = new Date(end + "T12:00:00-05:00");
  const start =
    period === "month"
      ? end.slice(0, 7) + "-01"
      : bogotaDate(
          new Date(
            today.getTime() -
              (period === "today" ? 0 : period === "7" ? 6 : 29) * 864e5,
          ),
        );
  return { start, end };
}
export function analyze(
  data: Snapshot,
  start: string,
  end: string,
  location = "all",
) {
  const inPeriod = (date: string) => {
    const d = bogotaDate(date);
    return d >= start && d <= end;
  };
  const sales = data.sales.filter(
    (s) =>
      s.status === "completed" &&
      inPeriod(s.created_at) &&
      (location === "all" || s.location_id === location),
  );
  const ids = new Set(sales.map((s) => s.id));
  const items = data.items.filter((i) => ids.has(i.sale_id));
  const revenue = sales.reduce((a, s) => a + s.subtotal, 0),
    total = sales.reduce((a, s) => a + s.total, 0),
    tax = sales.reduce((a, s) => a + s.tax, 0),
    cogs = sales.reduce((a, s) => a + s.cost, 0);
  const expenses = data.expenses.filter((e) => inPeriod(e.created_at));
  const spending = expenses.reduce((a, e) => a + e.amount, 0);
  const days = Math.max(
    1,
    Math.round(
      (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
        864e5,
    ) + 1,
  );
  const daily = Array.from({ length: Math.min(days, 366) }, (_, i) => {
    const date = new Date(Date.parse(start + "T12:00:00Z") + i * 864e5)
      .toISOString()
      .slice(0, 10);
    return {
      date,
      total: sales
        .filter((s) => bogotaDate(s.created_at) === date)
        .reduce((a, s) => a + s.total, 0),
    };
  });
  const quantities = new Map<string, Row>();
  for (const p of data.products) {
    const sold = items.filter((i) => i.product_id === p.id);
    const units = sold.reduce((a, i) => a + i.quantity, 0);
    const value = sold.reduce((a, i) => a + i.subtotal, 0);
    const cost = sold.reduce((a, i) => a + i.unit_cost * i.quantity, 0);
    const stock = data.stock
      .filter(
        (s) =>
          s.product_id === p.id &&
          (location === "all" || s.location_id === location),
      )
      .reduce((a, s) => a + s.quantity, 0);
    quantities.set(p.id, {
      ...p,
      units,
      revenue: value,
      profit: value - cost,
      stock,
      coverage: units ? stock / (units / days) : null,
      margin: value ? ((value - cost) / value) * 100 : 0,
    });
  }
  const ranked = [...quantities.values()].sort((a, b) => b.revenue - a.revenue);
  const pairs = new Map<string, { a: string; b: string; count: number }>(),
    frequencies = new Map<string, number>();
  for (const s of sales) {
    const products = [
      ...new Set(
        items
          .filter((i) => i.sale_id === s.id)
          .map((i) => String(i.product_id)),
      ),
    ].sort();
    products.forEach((p) => frequencies.set(p, (frequencies.get(p) || 0) + 1));
    for (let i = 0; i < products.length; i++)
      for (let j = i + 1; j < products.length; j++) {
        const key = products[i] + "|" + products[j];
        const pair = pairs.get(key) || {
          a: products[i],
          b: products[j],
          count: 0,
        };
        pair.count++;
        pairs.set(key, pair);
      }
  }
  const baskets = [...pairs.values()]
    .map((p) => ({
      ...p,
      aName: quantities.get(p.a)?.name,
      bName: quantities.get(p.b)?.name,
      support: sales.length ? (p.count / sales.length) * 100 : 0,
      confidence: (p.count / (frequencies.get(p.a) || 1)) * 100,
      lift: sales.length
        ? (p.count * sales.length) /
          ((frequencies.get(p.a) || 1) * (frequencies.get(p.b) || 1))
        : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const group = (rows: Row[], field: string, value: string) =>
    Object.entries(
      rows.reduce(
        (a, r) => ({ ...a, [r[field]]: (a[r[field]] || 0) + r[value] }),
        {} as Record<string, number>,
      ),
    )
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value);
  const currentStock = [...quantities.values()].reduce(
    (a, p) => a + p.stock * p.cost,
    0,
  );
  const movements = data.movements.filter(
    (m) => location === "all" || m.location_id === location,
  );
  const opening = movements
    .filter((m) => bogotaDate(m.created_at) < start)
    .reduce((a, m) => a + m.quantity * m.unit_cost, 0);
  const closing = movements
    .filter((m) => bogotaDate(m.created_at) <= end)
    .reduce((a, m) => a + m.quantity * m.unit_cost, 0);
  const average = (Math.max(0, opening) + Math.max(0, closing)) / 2;
  const credit = data.sales.filter(
    (s) =>
      s.status === "completed" &&
      s.total > s.paid &&
      (location === "all" || s.location_id === location),
  );
  const payable = data.purchases.filter(
    (p) => p.status === "received" && p.total > p.paid,
  );
  const customers = data.contacts
    .filter((c) => c.kind === "customer")
    .map((c): Row & { orders: number; revenue: number; balance: number } => {
      const orders = sales.filter((s) => s.customer_id === c.id);
      return {
        ...c,
        orders: orders.length,
        revenue: orders.reduce((a, s) => a + s.subtotal, 0),
        balance: credit
          .filter((s) => s.customer_id === c.id)
          .reduce((a, s) => a + s.total - s.paid, 0),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const repeat = customers.filter((c) => c.orders > 1).length,
    activeCustomers = customers.filter((c) => c.orders > 0).length;
  return {
    sales,
    items,
    revenue,
    total,
    tax,
    cogs,
    profit: revenue - cogs,
    margin: revenue ? ((revenue - cogs) / revenue) * 100 : 0,
    spending,
    operating: revenue - cogs - spending,
    days,
    daily,
    ranked,
    baskets,
    channels: group(sales, "channel", "subtotal"),
    categories: group(
      items.map((i) => ({
        ...i,
        category: quantities.get(i.product_id)?.category || "Otros",
      })),
      "category",
      "subtotal",
    ),
    expenseCategories: group(expenses, "category", "amount"),
    currentStock,
    turnover: average > 0 ? cogs / average : null,
    credit,
    payable,
    receivable: credit.reduce((a, s) => a + s.total - s.paid, 0),
    owed: payable.reduce((a, s) => a + s.total - s.paid, 0),
    low: data.products
      .filter((p) => p.active)
      .flatMap((p) =>
        data.locations
          .filter((l) => location === "all" || l.id === location)
          .map((l) => ({
            product_id: p.id,
            location_id: l.id,
            quantity:
              data.stock.find(
                (s) => s.product_id === p.id && s.location_id === l.id,
              )?.quantity || 0,
            product: p,
            location: l.name,
          })),
      )
      .filter((s) => s.quantity <= s.product.min_stock),
    customers,
    repeatRate: activeCustomers ? (repeat / activeCustomers) * 100 : 0,
    ticket: sales.length ? total / sales.length : 0,
  };
}
