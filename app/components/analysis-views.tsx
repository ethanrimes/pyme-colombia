"use client";
import Link from "next/link";
import { ArrowUpRight, Package, Receipt, ArrowDownToLine } from "lucide-react";
import { Panel, Stat, Table, Empty, Badge } from "./ui";
import { money, number, bogotaDate, type Snapshot } from "@/lib/domain";
import { analyze } from "@/lib/analytics";
import { channelLabel, csv, download } from "@/lib/client";
type Analysis = ReturnType<typeof analyze>;
export function Bars({ a }: { a: Analysis }) {
  const max = Math.max(...a.daily.map((d) => d.total), 1);
  return (
    <>
      <div className="chart">
        <div className="chart-labels">
          {[1, 2 / 3, 1 / 3, 0].map((n) => (
            <span key={n}>{money(max * n)}</span>
          ))}
        </div>
        <div
          className="bars"
          role="img"
          aria-label="Ventas diarias en COP. Cada barra incluye la fecha y el total."
        >
          {a.daily.map((b) => (
            <div
              key={b.date}
              tabIndex={0}
              aria-label={b.date + ": " + money(b.total)}
              style={{
                height: Math.max((b.total / max) * 100, b.total ? 2 : 0) + "%",
              }}
              title={b.date + " · " + money(b.total)}
            />
          ))}
        </div>
      </div>
      <div className="chart-axis">
        {a.daily
          .filter(
            (_, i) =>
              i === 0 ||
              i === a.daily.length - 1 ||
              i === Math.floor(a.daily.length / 2),
          )
          .map((d) => (
            <span key={d.date}>
              {d.date.slice(8)}/{d.date.slice(5, 7)}
            </span>
          ))}
      </div>
    </>
  );
}
export function Channels({
  rows,
  labels = channelLabel,
}: {
  rows: { name: string; value: number }[];
  labels?: Record<string, string>;
}) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <>
      {!rows.length ? (
        <Empty />
      ) : (
        rows.map((r) => (
          <div className="channel" key={r.name}>
            <div>
              <span>{labels[r.name] || r.name}</span>
              <strong>
                {money(r.value)} · {number(total ? (r.value / total) * 100 : 0)}
                %
              </strong>
            </div>
            <div className="track">
              <span
                style={{ width: (total ? (r.value / total) * 100 : 0) + "%" }}
              />
            </div>
          </div>
        ))
      )}
    </>
  );
}
export function Dashboard({ a, data }: { a: Analysis; data: Snapshot }) {
  return (
    <>
      <section className="stats">
        <Stat
          label="Ventas con IVA"
          value={money(a.total)}
          detail={`${a.sales.length} ventas en el período`}
        />
        <Stat
          label="Utilidad bruta"
          value={money(a.profit)}
          detail={`${number(a.margin)}% de margen · sin IVA`}
        />
        <Stat
          label="Ticket promedio"
          value={money(a.ticket)}
          detail="Total vendido / número de ventas"
        />
        <Stat
          label="Inventario disponible"
          value={money(a.currentStock)}
          detail={`${data.products.length} productos · valor al costo actual`}
        />
      </section>
      <section className="dashboard-grid">
        <Panel
          title="Ventas por día"
          subtitle="Valores con IVA · COP"
          action={
            <span className="legend">
              <i /> Ventas
            </span>
          }
        >
          <Bars a={a} />
          <div className="chart-footer">
            <span>{a.sales.length} ventas registradas</span>
            <span>Ingresos sin IVA: {money(a.revenue)}</span>
          </div>
        </Panel>
        <Panel
          title="Pendientes"
          action={
            <span className="count">{a.low.length + a.credit.length}</span>
          }
        >
          <div className="alert-item">
            <span className="alert-icon amber">
              <Package size={18} />
            </span>
            <div>
              <strong>{a.low.length} alertas de stock</strong>
              <p>Productos por debajo del mínimo por sede.</p>
              <Link href="/inventario">Revisar inventario →</Link>
            </div>
          </div>
          <div className="alert-item">
            <span className="alert-icon blue">
              <Receipt size={18} />
            </span>
            <div>
              <strong>{money(a.receivable)} por cobrar</strong>
              <p>{a.credit.length} ventas con saldo pendiente.</p>
              <Link href="/ventas">Revisar cartera →</Link>
            </div>
          </div>
          <div className="insight">
            <span>COMPRA CONJUNTA</span>
            <strong>
              {a.baskets[0]
                ? a.baskets[0].aName + " + " + a.baskets[0].bName
                : "Sin compras conjuntas en el período"}
            </strong>
            <p>
              {a.baskets[0]
                ? `${a.baskets[0].count} ventas · ${number(a.baskets[0].support)}% de las transacciones`
                : "Se necesitan ventas con al menos dos productos."}
            </p>
            <Link href="/analisis">Ver análisis →</Link>
          </div>
        </Panel>
      </section>
      <section className="dashboard-grid lower">
        <Panel
          title="Productos más vendidos"
          subtitle="Ingresos sin IVA en el período"
          action={
            <Link href="/inventario">
              Ver inventario <ArrowUpRight size={12} />
            </Link>
          }
        >
          <Table headers={["Producto", "Categoría", "Unidades", "Ingresos"]}>
            {a.ranked
              .filter((p) => p.units)
              .slice(0, 5)
              .map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="product-cell">
                      <span className="product-icon">
                        <Package size={17} />
                      </span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>{p.sku}</small>
                      </div>
                    </div>
                  </td>
                  <td>{p.category}</td>
                  <td>{number(p.units)}</td>
                  <td>{money(p.revenue)}</td>
                </tr>
              ))}
          </Table>
          {!a.items.length && <Empty />}
        </Panel>
        <Panel title="Ventas por canal" subtitle="Ingresos sin IVA">
          <Channels rows={a.channels} />
        </Panel>
      </section>
    </>
  );
}
export function Analytics({ a }: { a: Analysis }) {
  return (
    <>
      <section className="stats">
        <Stat
          label="Ingresos sin IVA"
          value={money(a.revenue)}
          detail="Ventas completadas"
        />
        <Stat
          label="Margen bruto"
          value={number(a.margin) + "%"}
          detail={money(a.profit) + " de utilidad bruta"}
        />
        <Stat
          label="Rotación estimada"
          value={a.turnover === null ? "—" : number(a.turnover) + "×"}
          detail="Costo vendido / inventario promedio"
        />
        <Stat
          label="Clientes recurrentes"
          value={number(a.repeatRate) + "%"}
          detail="Clientes identificados con más de una compra"
        />
      </section>
      <div className="two-columns">
        <Panel title="Ingresos por categoría">
          <Channels rows={a.categories} labels={{}} />
        </Panel>
        <Panel
          title="Gastos por categoría (todas las sedes)"
          subtitle="Gastos registrados, sin compras de inventario"
        >
          <Channels rows={a.expenseCategories} labels={{}} />
        </Panel>
      </div>
      <Panel
        title="Productos comprados juntos"
        subtitle="Frecuencia, soporte y afinidad en el período"
        action={
          <button
            className="text-button"
            onClick={() =>
              csv(
                "compra-conjunta.csv",
                a.baskets.map((p) => ({
                  producto_a: p.aName,
                  producto_b: p.bName,
                  ventas: p.count,
                  soporte_porcentaje: p.support,
                  confianza_porcentaje: p.confidence,
                  lift: p.lift,
                })),
              )
            }
          >
            Exportar CSV
          </button>
        }
      >
        <Table
          headers={[
            "Productos",
            "Ventas juntas",
            "Soporte",
            "Confianza A → B",
            "Lift",
          ]}
        >
          {a.baskets.map((p) => (
            <tr key={p.a + p.b}>
              <td>
                <strong>{p.aName}</strong>
                <small className="cell-sub">+ {p.bName}</small>
              </td>
              <td>{p.count}</td>
              <td>{number(p.support)}%</td>
              <td>{number(p.confidence)}%</td>
              <td>
                <Badge>{number(p.lift)}×</Badge>
              </td>
            </tr>
          ))}
        </Table>
        {!a.baskets.length && <Empty />}
        <p className="panel-note">
          Soporte: porcentaje de ventas con ambos productos. Confianza: compras
          de B entre quienes compran A. Lift: afinidad respecto a una compra
          independiente. Interpreta muestras pequeñas con cautela.
        </p>
      </Panel>
      <div className="section-spacer" />
      <Panel
        title="Rentabilidad y reposición"
        subtitle="Cobertura basada en unidades vendidas por día del período"
      >
        <Table
          headers={[
            "Producto",
            "Unidades",
            "Ingresos netos",
            "Margen",
            "Disponible",
            "Cobertura",
          ]}
        >
          {a.ranked.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.name}</strong>
                <small className="cell-sub">{p.sku}</small>
              </td>
              <td>{number(p.units)}</td>
              <td>{money(p.revenue)}</td>
              <td>{number(p.margin)}%</td>
              <td>{p.stock}</td>
              <td>
                {p.coverage === null
                  ? "Sin ventas"
                  : number(p.coverage) + " días"}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <p className="section-note">
        Rotación estimada: costo de ventas dividido por la media del valor
        inicial y final del libro de movimientos. El stock disponible excluye
        pedidos online reservados. Las ventas anuladas se excluyen de los
        períodos consultados.
      </p>
    </>
  );
}
export function Reports({
  a,
  data,
  start,
  end,
  onError,
}: {
  a: Analysis;
  data: Snapshot;
  start: string;
  end: string;
  onError: (s: string) => void;
}) {
  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const reports = [
    {
      name: "Ventas detalladas",
      description: "Venta, cliente, canal, base, IVA, costo, cobros y saldo.",
      action: () =>
        csv(
          "ventas-" + start + ".csv",
          a.sales.map((s) => ({
            numero: s.number,
            fecha: s.created_at,
            cliente:
              data.contacts.find((c) => c.id === s.customer_id)?.name ||
              "Consumidor final",
            canal: channelLabel[s.channel],
            base_cop: s.subtotal / 100,
            iva_cop: s.tax / 100,
            total_cop: s.total / 100,
            costo_cop: s.cost / 100,
            pagado_cop: s.paid / 100,
            saldo_cop: (s.total - s.paid) / 100,
            estado_factura: s.invoice_status,
          })),
        ),
    },
    {
      name: "Inventario por sede",
      description: "Existencias actuales, costo, valor y mínimos por SKU.",
      action: () =>
        csv(
          "inventario.csv",
          data.stock.map((s) => {
            const p = data.products.find((p) => p.id === s.product_id)!;
            return {
              sku: p.sku,
              producto: p.name,
              sede: data.locations.find((l) => l.id === s.location_id)?.name,
              unidades: s.quantity,
              costo_cop: p.cost / 100,
              valor_cop: (p.cost * s.quantity) / 100,
              minimo: p.min_stock,
            };
          }),
        ),
    },
    {
      name: "Kárdex",
      description:
        "Movimientos del período: ventas, compras, ajustes y traslados.",
      action: () =>
        csv(
          "kardex.csv",
          data.movements
            .filter(
              (m) =>
                bogotaDate(m.created_at) >= start &&
                bogotaDate(m.created_at) <= end,
            )
            .map((m) => ({
              fecha: m.created_at,
              sku: data.products.find((p) => p.id === m.product_id)?.sku,
              sede: data.locations.find((l) => l.id === m.location_id)?.name,
              tipo: m.kind,
              unidades: m.quantity,
              costo_cop: m.unit_cost / 100,
              referencia: m.reference,
              motivo: m.note,
            })),
        ),
    },
    {
      name: "Cartera y vencimientos",
      description: "Saldos actuales por cliente y fecha de vencimiento.",
      action: () =>
        csv(
          "cartera.csv",
          a.credit.map((s) => ({
            venta: s.number,
            cliente: data.contacts.find((c) => c.id === s.customer_id)?.name,
            vencimiento: s.due_date,
            saldo_cop: (s.total - s.paid) / 100,
          })),
        ),
    },
    {
      name: "Impuestos de ventas",
      description:
        "Base e IVA agrupados por tarifa. Auxiliar para el contador.",
      action: () =>
        csv(
          "iva-ventas.csv",
          [0, 5, 19].map((rate) => ({
            tarifa: rate,
            base_cop:
              a.items
                .filter((i) => i.tax_rate === rate)
                .reduce((a, i) => a + i.subtotal, 0) / 100,
            iva_cop:
              a.items
                .filter((i) => i.tax_rate === rate)
                .reduce((a, i) => a + i.tax, 0) / 100,
          })),
        ),
    },
    {
      name: "Movimientos de dinero",
      description: "Cobros, pagos a proveedores, gastos y devoluciones.",
      action: () =>
        csv(
          "tesoreria.csv",
          [
            ...data.payments.map((p) => ({
              fecha: p.created_at,
              tipo: p.sale_id ? "Cobro" : "Pago proveedor",
              referencia: p.reference,
              medio: p.method,
              monto_cop: ((p.sale_id ? 1 : -1) * p.amount) / 100,
            })),
            ...data.expenses.map((e) => ({
              fecha: e.created_at,
              tipo: "Gasto",
              referencia: e.description,
              medio: e.method,
              monto_cop: -e.amount / 100,
            })),
            ...data.refunds.map((r) => ({
              fecha: r.created_at,
              tipo: "Devolución",
              referencia: r.sale_id,
              medio: r.method,
              monto_cop: -r.amount / 100,
            })),
          ].filter(
            (r) => bogotaDate(r.fecha) >= start && bogotaDate(r.fecha) <= end,
          ),
        ),
    },
    {
      name: "Cuentas por pagar",
      description: "Compras recibidas con saldo a proveedores.",
      action: () =>
        csv(
          "proveedores.csv",
          a.payable.map((p) => ({
            orden: p.number,
            proveedor: data.contacts.find((c) => c.id === p.supplier_id)?.name,
            vencimiento: p.due_date,
            saldo_cop: (p.total - p.paid) / 100,
          })),
        ),
    },
    {
      name: "Exportación completa JSON",
      description:
        "Todos los registros del negocio. No incluye secretos de conexión.",
      action: () =>
        download(
          "abastelo-registros-" + end + ".json",
          JSON.stringify(data, null, 2),
          "application/json",
        ),
    },
  ];
  return (
    <>
      <div className="two-columns">
        <Panel
          title="Resultado operativo"
          subtitle="Período seleccionado · COP"
        >
          <div className="statement">
            {[
              ["Ingresos sin IVA", a.revenue],
              ["Costo de ventas", -a.cogs],
              ["Utilidad bruta", a.profit],
              ["Gastos operativos", -a.spending],
              ["Resultado operativo estimado", a.operating],
            ].map(([label, value], i) => (
              <div className={i === 2 || i === 4 ? "strong" : ""} key={label}>
                <span>{label}</span>
                <strong>{money(Number(value))}</strong>
              </div>
            ))}
          </div>
          <p className="panel-note">
            Informe gerencial. No incluye depreciaciones, retenciones ni ajustes
            contables.
          </p>
        </Panel>
        <Panel title="Saldos actuales">
          <div className="statement">
            <div>
              <span>Cuentas por cobrar</span>
              <strong>{money(a.receivable)}</strong>
            </div>
            <div>
              <span>Cuentas por pagar</span>
              <strong>{money(a.owed)}</strong>
            </div>
            <div>
              <span>Stock disponible al costo</span>
              <strong>{money(a.currentStock)}</strong>
            </div>
            <div>
              <span>IVA generado en el período</span>
              <strong>{money(a.tax)}</strong>
            </div>
          </div>
          <p className="panel-note">
            Los saldos de cartera e inventario corresponden al estado actual,
            sin filtro de fecha.
          </p>
        </Panel>
      </div>
      <div className="report-grid">
        {reports.map((r) => (
          <button
            className="report-card"
            key={r.name}
            onClick={() => run(r.action)}
          >
            <ArrowDownToLine size={20} />
            <h3>{r.name}</h3>
            <p>{r.description}</p>
            <span>Descargar →</span>
          </button>
        ))}
      </div>
      <p className="section-note">
        Los CSV pueden abrirse en Excel, Google Sheets y herramientas de BI. El
        contador debe revisar y mapear el plan de cuentas antes de importar a su
        software contable. Estos auxiliares no constituyen declaraciones
        tributarias.
      </p>
    </>
  );
}
