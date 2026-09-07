"use client";
import {
  useCallback,
  useRef,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ArrowUpRight,
  Truck,
  Users,
  Wallet,
  ChartNoAxesCombined,
  FileText,
  Plug,
  Settings,
  Plus,
  Download,
  Upload,
  RefreshCw,
  ArrowRightLeft,
  History,
  Check,
  Menu,
  ChevronDown,
  Store,
  Smartphone,
  Building2,
  ExternalLink,
} from "lucide-react";
import {
  money,
  number,
  bogotaDate,
  type Snapshot,
  type Row,
} from "@/lib/domain";
import { analyze, dateRange } from "@/lib/analytics";
import { api, exportProducts, channelLabel, methodLabel } from "@/lib/client";
import {
  Panel,
  Stat,
  Table,
  Empty,
  Badge,
  SearchBox,
  Field,
  Modal,
} from "./ui";
import { Forms, type DialogState } from "./forms";
import { POS } from "./pos";
import { Dashboard, Analytics, Reports } from "./analysis-views";
const nav = [
  ["resumen", "Resumen", LayoutDashboard],
  ["pos", "Punto de venta", ShoppingCart],
  ["inventario", "Inventario", Package],
  ["ventas", "Ventas y cartera", ArrowUpRight],
  ["compras", "Compras", Truck],
  ["contactos", "Clientes y proveedores", Users],
  ["gastos", "Gastos", Wallet],
  ["analisis", "Análisis", ChartNoAxesCombined],
  ["reportes", "Reportes", FileText],
  ["integraciones", "Integraciones", Plug],
  ["configuracion", "Configuración", Settings],
] as const;
const providers = [
  {
    provider: "wompi",
    title: "Wompi",
    tag: "Pagos",
    initial: "W",
    description:
      "Checkout para tarjetas, PSE y medios disponibles en Wompi. Confirmación del pago mediante eventos verificados.",
    direction: "Salida: cobro · Entrada: estado del pago",
    docs: "https://docs.wompi.co/docs/colombia/widget-checkout-web/",
  },
  {
    provider: "shopify",
    title: "Shopify",
    tag: "Ecommerce",
    initial: "S",
    description:
      "Recibe órdenes pagadas y descuenta stock por SKU. Requiere suscribir el evento orders/paid.",
    direction: "Entrada: ventas pagadas · Salida: inventario CSV",
    docs: "https://shopify.dev/docs/apps/build/webhooks",
  },
  {
    provider: "woocommerce",
    title: "WooCommerce",
    tag: "Ecommerce",
    initial: "woo",
    description:
      "Recibe órdenes pagadas en estado processing o completed. Valida la firma y evita duplicados.",
    direction: "Entrada: pedidos · Salida: inventario CSV",
    docs: "https://woocommerce.github.io/woocommerce-rest-api-docs/#webhooks",
  },
  {
    provider: "factus",
    title: "Factus · DIAN",
    tag: "Facturación",
    initial: "F",
    description:
      "Emite facturas electrónicas con una cuenta Factus y numeración habilitada. Revisa los datos fiscales antes de emitir.",
    direction: "Salida: factura · Entrada: validación y CUFE",
    docs: "https://developers.factus.com.co/facturas/crear-y-validar/",
  },
];
export default function ERP({ children }: { children: ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginKey, setLoginKey] = useState("");
  const pathname = usePathname();
  const view = pathname.split("/")[1] || "resumen";
  const [space, setSpace] = useState("demo"),
    [data, setData] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [period, setPeriod] = useState("30"),
    [start, setStart] = useState(dateRange("30").start),
    [end, setEnd] = useState(dateRange("30").end),
    [location, setLocation] = useState("all"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [dialog, setDialog] = useState<DialogState | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [menu, setMenu] = useState(false),
    [working, setWorking] = useState(false),
    [lastUpdated, setLastUpdated] = useState("");
  const requestSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const d = await api("snapshot", space);
      if (sequence !== requestSequence.current) return;
      setData(d);
      setError("");
      setLastUpdated(
        new Date().toLocaleTimeString("es-CO", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (e) {
      if (sequence === requestSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [space]);
  useEffect(() => {
    // The workspace is an external data source; refresh also updates its loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  useEffect(() => {
    // Reset filters when navigation changes the operational screen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch("");
    setFilter("all");
    setMenu(false);
    if (["gastos", "compras", "reportes"].includes(view)) setLocation("all");
  }, [view]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const a = useMemo(
    () => (data ? analyze(data, start, end, location) : null),
    [data, start, end, location],
  );
  const changed = (m: string) => {
    setToast(m);
    void refresh();
  };
  const action = async (
    path: string,
    body: Row = {},
    message = "Registro actualizado",
  ) => {
    setWorking(true);
    try {
      const r = await api(path, space, body);
      changed(message);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setWorking(false);
    }
  };
  const matches = (r: Row) =>
    Object.values(r).join(" ").toLowerCase().includes(search.toLowerCase());
  const open = (kind: string, record?: Row) => setDialog({ kind, record });
  const exportSafely = (f: () => void) => {
    try {
      f();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const title = nav.find((n) => n[0] === view)?.[1] || "Resumen";
  function changePeriod(value: string) {
    setPeriod(value);
    if (value !== "custom") {
      const r = dateRange(value);
      setStart(r.start);
      setEnd(r.end);
    }
  }
  function settingsForm() {
    if (!data) return null;
    return (
      <div className="two-columns">
        <Panel title="Datos de la empresa">
          <form
            className="settings-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              await action("settings", f, "Datos actualizados");
            }}
          >
            <div className="form-grid">
              {[
                ["name", "Nombre"],
                ["nit", "NIT"],
                ["email", "Correo"],
                ["phone", "Teléfono"],
                ["address", "Dirección"],
                ["city", "Ciudad"],
              ].map(([name, label]) => (
                <Field key={name} label={label}>
                  <input
                    key={data.org.id + name}
                    name={name}
                    required={name === "name"}
                    type={name === "email" ? "email" : "text"}
                    defaultValue={data.org[name]}
                  />
                </Field>
              ))}
            </div>
            <button className="primary" disabled={working}>
              Guardar cambios
            </button>
          </form>
        </Panel>
        <Panel
          title="Sedes"
          action={
            <button className="text-button" onClick={() => open("location")}>
              + Nueva sede
            </button>
          }
        >
          {data.locations.map((l) => (
            <div className="list-row" key={l.id}>
              <Building2 size={18} />
              <strong>{l.name}</strong>
              <small>
                {data.stock
                  .filter((s) => s.location_id === l.id)
                  .reduce((a, s) => a + s.quantity, 0)}{" "}
                unidades
              </small>
            </div>
          ))}
        </Panel>
        <Panel
          title="Aplicaciones móviles"
          subtitle="iOS y Android"
          action={<Smartphone size={20} />}
        >
          <div className="panel-content">
            <p>
              Autoriza cada teléfono desde aquí e ingresa la clave en la app
              Nexo. Los dispositivos tienen acceso a este negocio y sus
              operaciones.
            </p>
            <button className="secondary" onClick={() => open("device")}>
              Autorizar dispositivo
            </button>
            <p className="form-note">
              Las claves vencen a los 90 días. El acceso de las apps y de los
              webhooks requiere un backend accesible sin el inicio de sesión de
              Sites. Consulta la guía de despliegue del repositorio.
            </p>
          </div>
          {data.devices.map((d) => (
            <div className="list-row" key={d.id}>
              <Smartphone size={16} />
              <div>
                <strong>{d.name}</strong>
                <small className="cell-sub">
                  {d.revoked
                    ? "Revocado"
                    : "Vence " + d.expires_at.slice(0, 10)}
                </small>
              </div>
              {!d.revoked && (
                <button
                  className="text-button danger"
                  onClick={() => {
                    if (confirm("¿Revocar el acceso de este dispositivo?"))
                      void action("devices/" + d.id);
                  }}
                >
                  Revocar
                </button>
              )}
            </div>
          ))}
        </Panel>
        <Panel title="Historial de actividad">
          <div className="activity-list">
            {[...data.audit]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 15)
              .map((e) => (
                <div key={e.id}>
                  <span className="status-dot" />
                  <div>
                    <strong>{e.action}</strong>
                    <small>
                      {e.reference} ·{" "}
                      {new Date(e.created_at).toLocaleString("es-CO", {
                        timeZone: "America/Bogota",
                      })}
                    </small>
                  </div>
                </div>
              ))}
            {!data.audit.length && (
              <Empty text="No se han registrado cambios." />
            )}
          </div>
        </Panel>
      </div>
    );
  }
  return (
    <div className="shell">
      <aside className={"sidebar " + (menu ? "mobile-open" : "")}>
        <div className="brand-row">
          <Link className="brand" href="/">
            nexo<span>●</span>
          </Link>
          <button
            className="icon-button mobile-menu"
            aria-label="Mostrar menú"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={21} />
          </button>
        </div>
        <div className="business">
          <span className="business-icon">
            <Store size={19} />
          </span>
          <div>
            <strong>{data?.org.name || "Nexo ERP"}</strong>
            <small>{space === "demo" ? "Demostración" : "Mi empresa"}</small>
          </div>
        </div>
        <nav>
          {nav.map(([key, label, Icon], i) => (
            <div key={key}>
              {i === 7 && (
                <small className="nav-label">REPORTES Y CONFIGURACIÓN</small>
              )}
              <Link
                href={key === "resumen" ? "/" : "/" + key}
                className={view === key ? "active" : ""}
              >
                <Icon size={18} strokeWidth={1.7} />
                {label}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          {space === "demo" ? "Datos de demostración" : "Datos de la empresa"}
          <div className="profile">
            <Settings size={18} />
            <div>
              <strong>Administrador</strong>
              <small>America/Bogotá · COP</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>{title}</span>
          <div>
            <button
              className={"space-switch " + (space === "demo" ? "demo" : "")}
              onClick={() => {
                const next = space === "demo" ? "live" : "demo";
                setSpace(next);
                setData(null);
                setLocation("all");
                setDialog(null);
                setDetail(null);
              }}
            >
              {space === "demo" ? "Demostración" : "Mi empresa"}
              <ChevronDown size={13} />
            </button>
            <button
              className="icon-button"
              aria-label="Actualizar datos"
              title="Actualizar"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} className={loading ? "spinning" : ""} />
            </button>
          </div>
        </header>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <h1>{title}</h1>
              {view === "resumen" && <p>{data?.org.name}</p>}
            </div>
            <div className="heading-actions">
              {view === "resumen" && (
                <Link className="primary" href="/pos">
                  <Plus size={16} /> Nueva venta
                </Link>
              )}
              {view === "inventario" && (
                <>
                  <button
                    className="secondary"
                    onClick={() => open("import", { type: "products" })}
                  >
                    <Upload size={14} /> Importar
                  </button>
                  <button className="primary" onClick={() => open("product")}>
                    <Plus size={15} /> Producto
                  </button>
                </>
              )}
              {view === "ventas" && (
                <Link className="primary" href="/pos">
                  <Plus size={16} /> Nueva venta
                </Link>
              )}
              {view === "compras" && (
                <button className="primary" onClick={() => open("purchase")}>
                  <Plus size={15} /> Orden de compra
                </button>
              )}
              {view === "contactos" && (
                <>
                  <button
                    className="secondary"
                    onClick={() => open("contact", { kind: "supplier" })}
                  >
                    + Proveedor
                  </button>
                  <button
                    className="primary"
                    onClick={() => open("contact", { kind: "customer" })}
                  >
                    + Cliente
                  </button>
                </>
              )}
              {view === "gastos" && (
                <button className="primary" onClick={() => open("expense")}>
                  <Plus size={15} /> Registrar gasto
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="text-button"
                onClick={() => setLoginOpen(true)}
              >
                Conectar con clave
              </button>
              <button className="text-button" onClick={() => setError("")}>
                Cerrar
              </button>
              {error.includes("sesión") && (
                <Link href="/signin-with-chatgpt?return_to=/" prefetch={false}>
                  Iniciar sesión
                </Link>
              )}
            </div>
          )}
          {[
            "resumen",
            "ventas",
            "compras",
            "analisis",
            "reportes",
            "gastos",
          ].includes(view) && (
            <div className="toolbar">
              <div className="segmented">
                {[
                  ["30", "30 días"],
                  ["month", "Este mes"],
                  ["7", "7 días"],
                  ["today", "Hoy"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={period === v ? "selected" : ""}
                    onClick={() => changePeriod(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="date-controls">
                <input
                  aria-label="Fecha inicial"
                  type="date"
                  value={start}
                  max={end}
                  onChange={(e) => {
                    setPeriod("custom");
                    setStart(e.target.value);
                  }}
                />
                <span>—</span>
                <input
                  aria-label="Fecha final"
                  type="date"
                  value={end}
                  min={start}
                  max={bogotaDate()}
                  onChange={(e) => {
                    setPeriod("custom");
                    setEnd(e.target.value);
                  }}
                />
                {!["gastos", "compras", "reportes"].includes(view) && (
                  <select
                    aria-label="Filtro de sede"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  >
                    <option value="all">Todas las sedes</option>
                    {data?.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}
          {!data || !a ? (
            <div className="loading-panel">
              <RefreshCw className="spinning" size={22} />
              <p>
                {error
                  ? "No se pudieron cargar los registros."
                  : "Cargando registros…"}
              </p>
              <button className="secondary" onClick={() => void refresh()}>
                Actualizar
              </button>
            </div>
          ) : (
            <>
              {view === "resumen" && <Dashboard a={a} data={data} />}
              {view === "pos" && (
                <POS key={space} data={data} space={space} onSaved={changed} />
              )}
              {view === "inventario" && (
                <>
                  <section className="stats">
                    <Stat
                      label="Productos"
                      value={number(data.products.length)}
                    />
                    <Stat
                      label="Unidades disponibles"
                      value={number(a.ranked.reduce((s, p) => s + p.stock, 0))}
                    />
                    <Stat
                      label="Inventario al costo"
                      value={money(a.currentStock)}
                    />
                    <Stat
                      label="Alertas por sede"
                      value={number(a.low.length)}
                      detail="Stock igual o inferior al mínimo"
                    />
                  </section>
                  <div className="list-toolbar">
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder="Buscar nombre, SKU o código"
                    />
                    <select
                      aria-label="Sede"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    >
                      <option value="all">Todas las sedes</option>
                      {data.locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Estado de stock"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">Todos los productos</option>
                      <option value="low">Stock bajo</option>
                    </select>
                    <button
                      className="secondary"
                      onClick={() => open("inventory")}
                    >
                      <Plus size={14} /> Ajuste
                    </button>
                    <button
                      className="secondary"
                      onClick={() => open("transfer")}
                    >
                      <ArrowRightLeft size={14} /> Traslado
                    </button>
                    <button
                      className="icon-button"
                      title="Exportar catálogo"
                      aria-label="Exportar catálogo CSV"
                      onClick={() => exportSafely(() => exportProducts(data))}
                    >
                      <Download size={17} />
                    </button>
                  </div>
                  <Panel
                    title="Productos"
                    action={
                      <span className="muted">Precios con IVA · COP</span>
                    }
                  >
                    <Table
                      headers={[
                        "Producto",
                        "Categoría",
                        "Costo",
                        "Precio",
                        "Mayorista",
                        "Disponible",
                        "",
                      ]}
                    >
                      {a.ranked
                        .filter(
                          (p) =>
                            matches(p) &&
                            (filter !== "low" ||
                              a.low.some((s) => s.product_id === p.id)),
                        )
                        .map((p) => (
                          <tr key={p.id}>
                            <td>
                              <button
                                className="product-cell text-button"
                                onClick={() => open("product", p)}
                              >
                                <span className="product-icon">
                                  <Package size={17} />
                                </span>
                                <div>
                                  <strong>{p.name}</strong>
                                  <small>{p.sku}</small>
                                </div>
                              </button>
                            </td>
                            <td>{p.category}</td>
                            <td>{money(p.cost)}</td>
                            <td>{money(p.price)}</td>
                            <td>
                              {money(p.wholesale_price)}
                              <small className="cell-sub">
                                Desde {p.wholesale_min} und.
                              </small>
                            </td>
                            <td>
                              <Badge
                                tone={
                                  p.stock <= p.min_stock ? "amber" : "green"
                                }
                              >
                                {p.stock} {p.unit}
                              </Badge>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={"Historial de " + p.name}
                                onClick={() =>
                                  setDetail({ type: "inventory", ...p })
                                }
                              >
                                <History size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </Table>
                    {!data.products.length && (
                      <Empty text="Agrega un producto o importa tu catálogo." />
                    )}
                  </Panel>
                </>
              )}
              {view === "ventas" && (
                <>
                  <section className="stats">
                    <Stat label="Ventas del período" value={money(a.total)} />
                    <Stat
                      label="Por cobrar"
                      value={money(a.receivable)}
                      detail="Saldo actual, todas las fechas"
                    />
                    <Stat
                      label="Cartera vencida"
                      value={money(
                        a.credit
                          .filter(
                            (s) => s.due_date && s.due_date < bogotaDate(),
                          )
                          .reduce((a, s) => a + s.total - s.paid, 0),
                      )}
                    />
                    <Stat
                      label="Pedidos online pendientes"
                      value={number(
                        data.sales.filter((s) => s.status === "pending").length,
                      )}
                      detail="Stock reservado, aún sin ingreso"
                    />
                  </section>
                  <div className="list-toolbar">
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder="Buscar venta o cliente"
                    />
                    <select
                      aria-label="Estado de la venta"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">Todas (período)</option>
                      <option value="credit">
                        Por cobrar (todas las fechas)
                      </option>
                      <option value="pending">
                        Pago pendiente (todas las fechas)
                      </option>
                      <option value="voided">Anuladas (período)</option>
                    </select>
                  </div>
                  <Panel title="Ventas">
                    <Table
                      headers={[
                        "Venta / fecha",
                        "Cliente",
                        "Canal",
                        "Total",
                        "Saldo",
                        "Estado",
                        "",
                      ]}
                    >
                      {data.sales
                        .filter(
                          (s) =>
                            matches({
                              ...s,
                              customer: data.contacts.find(
                                (c) => c.id === s.customer_id,
                              )?.name,
                            }) &&
                            (location === "all" ||
                              s.location_id === location) &&
                            (filter === "credit"
                              ? s.status === "completed" && s.paid < s.total
                              : filter === "pending"
                                ? s.status === "pending"
                                : bogotaDate(s.created_at) >= start &&
                                  bogotaDate(s.created_at) <= end &&
                                  (filter !== "voided" ||
                                    s.status === "voided")),
                        )
                        .sort((a, b) =>
                          b.created_at.localeCompare(a.created_at),
                        )
                        .map((s) => (
                          <tr key={s.id}>
                            <td>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setDetail({ type: "sale", ...s })
                                }
                              >
                                {s.number}
                              </button>
                              <small className="cell-sub">
                                {bogotaDate(s.created_at)}
                              </small>
                            </td>
                            <td>
                              {data.contacts.find((c) => c.id === s.customer_id)
                                ?.name || "Consumidor final"}
                            </td>
                            <td>{channelLabel[s.channel]}</td>
                            <td>{money(s.total)}</td>
                            <td>
                              {s.status === "voided"
                                ? "—"
                                : money(s.total - s.paid)}
                            </td>
                            <td>
                              <Badge
                                tone={
                                  s.status === "voided"
                                    ? "gray"
                                    : s.status === "pending" || s.paid < s.total
                                      ? "amber"
                                      : "green"
                                }
                              >
                                {s.status === "voided"
                                  ? "Anulada"
                                  : s.status === "pending"
                                    ? "Pago pendiente"
                                    : s.paid < s.total
                                      ? "Por cobrar"
                                      : "Pagada"}
                              </Badge>
                            </td>
                            <td>
                              {s.status === "completed" && s.paid < s.total && (
                                <button
                                  className="text-button"
                                  onClick={() => open("payment", s)}
                                >
                                  Abonar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </Table>
                    {!data.sales.length && <Empty />}
                  </Panel>
                </>
              )}
              {view === "compras" && (
                <>
                  <section className="stats">
                    <Stat
                      label="Órdenes pendientes"
                      value={number(
                        data.purchases.filter((p) => p.status === "ordered")
                          .length,
                      )}
                    />
                    <Stat label="Por pagar" value={money(a.owed)} />
                    <Stat
                      label="Compras recibidas"
                      value={money(
                        data.purchases
                          .filter(
                            (p) =>
                              p.status === "received" &&
                              bogotaDate(p.received_at) >= start &&
                              bogotaDate(p.received_at) <= end,
                          )
                          .reduce((a, p) => a + p.total, 0),
                      )}
                    />
                    <Stat
                      label="Proveedores"
                      value={number(
                        data.contacts.filter((c) => c.kind === "supplier")
                          .length,
                      )}
                    />
                  </section>
                  <Panel
                    title="Órdenes de compra"
                    subtitle="Todas las órdenes abiertas y recibidas"
                  >
                    <Table
                      headers={[
                        "Orden",
                        "Proveedor",
                        "Sede",
                        "Total",
                        "Saldo",
                        "Estado",
                        "Acción",
                      ]}
                    >
                      {[...data.purchases]
                        .sort((a, b) =>
                          b.created_at.localeCompare(a.created_at),
                        )
                        .map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.number}</strong>
                              <small className="cell-sub">
                                {bogotaDate(p.created_at)}
                              </small>
                            </td>
                            <td>
                              {
                                data.contacts.find(
                                  (c) => c.id === p.supplier_id,
                                )?.name
                              }
                            </td>
                            <td>
                              {
                                data.locations.find(
                                  (l) => l.id === p.location_id,
                                )?.name
                              }
                            </td>
                            <td>{money(p.total)}</td>
                            <td>{money(p.total - p.paid)}</td>
                            <td>
                              <Badge
                                tone={
                                  p.status === "ordered" ? "amber" : "green"
                                }
                              >
                                {p.status === "ordered"
                                  ? "Por recibir"
                                  : "Recibida"}
                              </Badge>
                            </td>
                            <td>
                              {p.status === "ordered" ? (
                                <button
                                  className="text-button"
                                  disabled={working}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "¿Confirmar recepción completa? Se sumarán las unidades al inventario.",
                                      )
                                    )
                                      void action(
                                        "purchases/" + p.id + "/receive",
                                        {},
                                        "Compra recibida",
                                      );
                                  }}
                                >
                                  Recibir mercancía
                                </button>
                              ) : (
                                p.paid < p.total && (
                                  <button
                                    className="text-button"
                                    onClick={() => open("payment", p)}
                                  >
                                    Registrar pago
                                  </button>
                                )
                              )}
                            </td>
                          </tr>
                        ))}
                    </Table>
                    {!data.purchases.length && (
                      <Empty text="Crea una orden de compra para registrar mercancía de proveedores." />
                    )}
                  </Panel>
                </>
              )}
              {view === "contactos" && (
                <>
                  <div className="list-toolbar">
                    <SearchBox
                      value={search}
                      onChange={setSearch}
                      placeholder="Buscar nombre o documento"
                    />
                    <select
                      aria-label="Tipo de contacto"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      <option value="customer">Clientes</option>
                      <option value="supplier">Proveedores</option>
                    </select>
                  </div>
                  <Panel title="Contactos">
                    <Table
                      headers={[
                        "Nombre",
                        "Tipo",
                        "Documento",
                        "Contacto",
                        "Ciudad",
                        "Saldo actual",
                      ]}
                    >
                      {data.contacts
                        .filter(
                          (c) =>
                            matches(c) &&
                            (filter === "all" || c.kind === filter),
                        )
                        .map((c) => (
                          <tr key={c.id}>
                            <td>
                              <strong>{c.name}</strong>
                            </td>
                            <td>
                              <Badge
                                tone={c.kind === "supplier" ? "blue" : "green"}
                              >
                                {c.kind === "supplier"
                                  ? "Proveedor"
                                  : "Cliente"}
                              </Badge>
                            </td>
                            <td>{c.document || "—"}</td>
                            <td>{c.email || c.phone || "—"}</td>
                            <td>{c.city}</td>
                            <td>
                              {money(
                                c.kind === "customer"
                                  ? a.credit
                                      .filter((s) => s.customer_id === c.id)
                                      .reduce((a, s) => a + s.total - s.paid, 0)
                                  : a.payable
                                      .filter((p) => p.supplier_id === c.id)
                                      .reduce(
                                        (a, p) => a + p.total - p.paid,
                                        0,
                                      ),
                              )}
                            </td>
                          </tr>
                        ))}
                    </Table>
                    {!data.contacts.length && (
                      <Empty text="Registra clientes y proveedores." />
                    )}
                  </Panel>
                </>
              )}
              {view === "gastos" && (
                <>
                  <section className="stats">
                    <Stat
                      label="Gastos del período"
                      value={money(a.spending)}
                    />
                    <Stat
                      label="Mayor categoría"
                      value={a.expenseCategories[0]?.name || "—"}
                      detail={
                        a.expenseCategories[0]
                          ? money(a.expenseCategories[0].value)
                          : ""
                      }
                    />
                    <Stat label="Utilidad bruta" value={money(a.profit)} />
                    <Stat
                      label="Resultado operativo estimado"
                      value={money(a.operating)}
                    />
                  </section>
                  <Panel title="Gastos registrados">
                    <Table
                      headers={[
                        "Fecha",
                        "Concepto",
                        "Categoría",
                        "Medio de pago",
                        "Valor",
                      ]}
                    >
                      {data.expenses
                        .filter(
                          (e) =>
                            bogotaDate(e.created_at) >= start &&
                            bogotaDate(e.created_at) <= end,
                        )
                        .sort((a, b) =>
                          b.created_at.localeCompare(a.created_at),
                        )
                        .map((e) => (
                          <tr key={e.id}>
                            <td>{bogotaDate(e.created_at)}</td>
                            <td>
                              <strong>{e.description}</strong>
                            </td>
                            <td>{e.category}</td>
                            <td>{methodLabel[e.method]}</td>
                            <td>{money(e.amount)}</td>
                          </tr>
                        ))}
                    </Table>
                    {!data.expenses.length && <Empty />}
                  </Panel>
                </>
              )}
              {view === "analisis" && <Analytics a={a} />}{" "}
              {view === "reportes" && (
                <Reports
                  a={a}
                  data={data}
                  start={start}
                  end={end}
                  onError={setError}
                />
              )}
              {view === "integraciones" && (
                <>
                  <div className="integration-grid">
                    {providers.map((p) => (
                      <article className="integration-card" key={p.provider}>
                        <div>
                          <span className={"provider-logo " + p.provider}>
                            {p.initial}
                          </span>
                          <Badge
                            tone={
                              data.integrations.some(
                                (i) => i.provider === p.provider,
                              )
                                ? "blue"
                                : "gray"
                            }
                          >
                            {data.integrations.some(
                              (i) => i.provider === p.provider,
                            )
                              ? "Configurada"
                              : "Sin configurar"}
                          </Badge>
                        </div>
                        <h2>{p.title}</h2>
                        <small>{p.tag}</small>
                        <p>{p.description}</p>
                        <div className="integration-direction">
                          {p.direction}
                        </div>
                        <div className="integration-actions">
                          <button
                            className="secondary"
                            onClick={() => open("integration", p)}
                          >
                            Configurar
                          </button>
                          <a href={p.docs} target="_blank" rel="noreferrer">
                            Documentación <ExternalLink size={12} />
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="two-columns">
                    <Panel
                      title="Archivos e intercambios"
                      subtitle="Entradas y salidas disponibles"
                    >
                      <div className="panel-content">
                        <div className="connector-row">
                          <FileText size={20} />
                          <div>
                            <strong>Excel / Google Sheets</strong>
                            <p>Importa catálogo CSV y exporta registros.</p>
                          </div>
                          <button
                            className="secondary"
                            onClick={() => open("import", { type: "products" })}
                          >
                            Importar
                          </button>
                        </div>
                        <div className="connector-row">
                          <Building2 size={20} />
                          <div>
                            <strong>Extractos bancarios</strong>
                            <p>
                              Importa movimientos CSV y concilia contra cobros y
                              pagos.
                            </p>
                          </div>
                          <button
                            className="secondary"
                            onClick={() => open("import", { type: "bank" })}
                          >
                            Importar
                          </button>
                        </div>
                        <div className="connector-row">
                          <ChartNoAxesCombined size={20} />
                          <div>
                            <strong>Contabilidad / Power BI</strong>
                            <p>
                              CSV y JSON para mapear en tu software contable o
                              de BI.
                            </p>
                          </div>
                          <Link className="secondary" href="/reportes">
                            Exportar
                          </Link>
                        </div>
                      </div>
                    </Panel>
                    <Panel
                      title="Eventos recibidos"
                      subtitle="Transacciones procesadas por las conexiones"
                    >
                      <div className="activity-list">
                        {data.events
                          .sort((a, b) =>
                            b.created_at.localeCompare(a.created_at),
                          )
                          .slice(0, 10)
                          .map((e) => (
                            <div key={e.id}>
                              <span className="status-dot" />
                              <div>
                                <strong>
                                  {e.provider} · {e.message}
                                </strong>
                                <small>
                                  {bogotaDate(e.created_at)} · {e.status}
                                </small>
                              </div>
                            </div>
                          ))}
                        {!data.events.length && (
                          <Empty text="No se han recibido eventos." />
                        )}
                      </div>
                    </Panel>
                  </div>
                  <Panel
                    title="Conciliación bancaria"
                    subtitle="Elige un pago registrado con el mismo monto y sentido"
                  >
                    <Table
                      headers={[
                        "Fecha",
                        "Descripción",
                        "Monto",
                        "Estado",
                        "Pago relacionado",
                      ]}
                    >
                      {data.bank.map((b) => (
                        <tr key={b.id}>
                          <td>{b.date}</td>
                          <td>
                            {b.description}
                            <small className="cell-sub">{b.external_id}</small>
                          </td>
                          <td>{money(b.amount)}</td>
                          <td>
                            <Badge tone={b.payment_id ? "green" : "amber"}>
                              {b.payment_id ? "Conciliado" : "Pendiente"}
                            </Badge>
                          </td>
                          <td>
                            {b.payment_id ? (
                              data.payments.find((p) => p.id === b.payment_id)
                                ?.reference
                            ) : (
                              <select
                                aria-label={"Conciliar " + b.description}
                                value=""
                                onChange={(e) => {
                                  if (e.target.value)
                                    void action(
                                      "bank/" + b.id + "/match",
                                      { paymentId: e.target.value },
                                      "Movimiento conciliado",
                                    );
                                }}
                              >
                                <option value="">Seleccionar pago…</option>
                                {data.payments
                                  .filter(
                                    (p) =>
                                      (p.sale_id ? p.amount : -p.amount) ===
                                        b.amount &&
                                      !data.bank.some(
                                        (b) => b.payment_id === p.id,
                                      ),
                                  )
                                  .map((p) => (
                                    <option value={p.id} key={p.id}>
                                      {p.reference} · {bogotaDate(p.created_at)}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                    {!data.bank.length && (
                      <Empty text="Importa un extracto usando la plantilla CSV." />
                    )}
                  </Panel>
                  <p className="section-note">
                    Mercado Libre, Siigo, Alegra, nómina, transportadoras y APIs
                    bancarias directas requieren adaptadores adicionales. Los
                    archivos CSV permiten intercambiar datos mientras se
                    desarrolla cada conexión.
                  </p>
                </>
              )}
              {view === "configuracion" && settingsForm()}
            </>
          )}
          {children}
          <footer>
            <span>{lastUpdated ? "Actualizado " + lastUpdated : ""}</span>
            <span>COP · Horario de Bogotá</span>
          </footer>
        </main>
      </div>
      {loginOpen && (
        <Modal title="Acceso al negocio" onClose={() => setLoginOpen(false)}>
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await fetch("/api/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: loginKey }),
              });
              if (r.ok) {
                setLoginOpen(false);
                setLoginKey("");
                void refresh();
              } else setError("Clave no válida o vencida");
            }}
          >
            <Field label="Clave de acceso">
              <input
                type="password"
                autoComplete="current-password"
                required
                value={loginKey}
                onChange={(e) => setLoginKey(e.target.value)}
              />
            </Field>
            <div className="modal-actions">
              <button className="primary">Conectar</button>
            </div>
          </form>
        </Modal>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
      {dialog && data && (
        <Forms
          key={
            dialog.kind + (dialog.record?.id || dialog.record?.provider || "")
          }
          dialog={dialog}
          data={data}
          space={space}
          onClose={() => setDialog(null)}
          onSaved={changed}
        />
      )}
      {detail && data && (
        <Modal
          title={
            detail.type === "sale"
              ? detail.number
              : detail.name + " · movimientos"
          }
          onClose={() => setDetail(null)}
        >
          {detail.type === "sale" ? (
            <>
              <div className="receipt">
                <h2>{data.org.name}</h2>
                <p>
                  {bogotaDate(detail.created_at)} ·{" "}
                  {channelLabel[detail.channel]}
                </p>
                {data.items
                  .filter((i) => i.sale_id === detail.id)
                  .map((i) => (
                    <div key={i.id}>
                      <span>
                        {i.quantity} × {i.name}
                      </span>
                      <strong>{money(i.total)}</strong>
                    </div>
                  ))}
                <div>
                  <span>Base sin IVA</span>
                  <strong>{money(detail.subtotal)}</strong>
                </div>
                <div>
                  <span>IVA</span>
                  <strong>{money(detail.tax)}</strong>
                </div>
                <div>
                  <strong>Total</strong>
                  <strong>{money(detail.total)}</strong>
                </div>
                <p>Comprobante interno. No es factura electrónica.</p>
                {detail.invoice_reference && (
                  <p>Factura: {detail.invoice_reference}</p>
                )}
              </div>
              <div className="modal-actions wrapping">
                <button className="secondary" onClick={() => window.print()}>
                  Imprimir
                </button>
                {detail.status === "pending" && (
                  <button
                    className="secondary"
                    onClick={async () => {
                      const r = await action(
                        "sales/" + detail.id + "/checkout",
                      );
                      if (r)
                        window.open(r.url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Abrir Wompi
                  </button>
                )}
                {detail.status === "completed" &&
                  detail.invoice_status !== "validated" && (
                    <button
                      className="secondary"
                      onClick={() => {
                        open("invoice", detail);
                        setDetail(null);
                      }}
                    >
                      Factura electrónica
                    </button>
                  )}
                {detail.status !== "voided" && (
                  <button
                    className="secondary danger"
                    disabled={working}
                    onClick={async () => {
                      if (
                        confirm(
                          "¿Devolver toda la mercancía y anular la venta? Confirma solo después de reembolsar el dinero recibido.",
                        )
                      ) {
                        const r = await action(
                          "sales/" + detail.id + "/void",
                          { confirm: true },
                          "Venta anulada",
                        );
                        if (r) setDetail(null);
                      }
                    }}
                  >
                    Anular y devolver
                  </button>
                )}
              </div>
            </>
          ) : (
            <Table
              headers={["Fecha", "Sede", "Movimiento", "Unidades", "Motivo"]}
            >
              {data.movements
                .filter((m) => m.product_id === detail.id)
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((m) => (
                  <tr key={m.id}>
                    <td>{bogotaDate(m.created_at)}</td>
                    <td>
                      {data.locations.find((l) => l.id === m.location_id)?.name}
                    </td>
                    <td>
                      {{
                        opening: "Inicial",
                        sale: "Venta",
                        return: "Devolución",
                        purchase: "Compra",
                        adjustment: "Ajuste",
                        transfer: "Traslado",
                      }[m.kind as string] || m.kind}
                    </td>
                    <td>
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity}
                    </td>
                    <td>{m.note}</td>
                  </tr>
                ))}
            </Table>
          )}
        </Modal>
      )}
    </div>
  );
}
