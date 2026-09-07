"use client";
import { useState } from "react";
import {
  Package,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Coffee,
  ShoppingBag,
} from "lucide-react";
import {
  money,
  priceLines,
  bogotaDate,
  type Snapshot,
  type Row,
} from "@/lib/domain";
import { api, methodLabel, channelLabel } from "@/lib/client";
import { Panel, Field, SearchBox, Empty, Modal, Badge } from "./ui";
export function POS({
  data,
  space,
  onSaved,
}: {
  data: Snapshot;
  space: string;
  onSaved: (m: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todas"),
    [location, setLocation] = useState(data.locations[0]?.id || ""),
    [channel, setChannel] = useState("pos"),
    [method, setMethod] = useState("cash"),
    [customer, setCustomer] = useState(""),
    [due, setDue] = useState(() =>
      bogotaDate(new Date(Date.now() + 30 * 864e5)),
    ),
    [cart, setCart] = useState<{ productId: string; quantity: number }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState<Row | null>(null),
    [key, setKey] = useState(() => crypto.randomUUID());
  const products = data.products.filter(
    (p) =>
      p.active &&
      [p.name, p.sku, p.barcode]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (category === "Todas" || p.category === category),
  );
  const available = (id: string) =>
    data.stock.find((s) => s.product_id === id && s.location_id === location)
      ?.quantity || 0;
  const lines = priceLines(data.products, cart, channel),
    total = lines.reduce((a, l) => a + l.total, 0),
    tax = lines.reduce((a, l) => a + l.tax, 0);
  function add(id: string) {
    setError("");
    setCart((c) => {
      const line = c.find((l) => l.productId === id);
      if ((line?.quantity || 0) >= available(id)) {
        setError("No hay más unidades disponibles en esta sede.");
        return c;
      }
      return line
        ? c.map((l) =>
            l.productId === id ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [...c, { productId: id, quantity: 1 }];
    });
  }
  async function pay() {
    if (!cart.length) return;
    setBusy(true);
    setError("");
    try {
      const sale = await api("sales", space, {
        locationId: location,
        channel,
        paymentMethod: method,
        customerId: customer || null,
        dueDate: method === "credit" ? due : null,
        items: cart,
        idempotencyKey: key,
      });
      setReceipt({ ...sale, lines });
      setCart([]);
      setKey(crypto.randomUUID());
      onSaved(
        method === "wompi"
          ? "Pedido guardado. El pago está pendiente."
          : "Venta registrada",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="pos-layout">
        <section>
          <div className="pos-controls">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Nombre, SKU o código de barras"
            />
            <select
              aria-label="Sede de venta"
              value={location}
              onChange={(e) => {
                if (
                  cart.length &&
                  !confirm("Cambiar de sede vacía la venta actual. ¿Continuar?")
                )
                  return;
                setLocation(e.target.value);
                setCart([]);
                setKey(crypto.randomUUID());
              }}
            >
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="category-tabs">
            {["Todas", ...new Set(data.products.map((p) => p.category))].map(
              (c) => (
                <button
                  key={c}
                  className={category === c ? "selected" : ""}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ),
            )}
          </div>
          <div className="product-grid">
            {products.map((p, i) => (
              <button
                className="product-tile"
                key={p.id}
                disabled={available(p.id) === 0 || busy}
                onClick={() => add(p.id)}
              >
                <div className={"product-visual tone-" + (i % 4)}>
                  {p.category === "Bebidas" ? (
                    <Coffee size={35} strokeWidth={1.2} />
                  ) : p.category === "Hogar" ? (
                    <ShoppingBag size={35} strokeWidth={1.2} />
                  ) : (
                    <Package size={35} strokeWidth={1.2} />
                  )}
                  <span>{p.unit}</span>
                </div>
                <div className="product-tile-text">
                  <small>{p.sku}</small>
                  <strong>{p.name}</strong>
                  <div>
                    <b>
                      {money(
                        channel === "wholesale" ? p.wholesale_price : p.price,
                      )}
                    </b>
                    <span>{available(p.id)} und.</span>
                  </div>
                  {channel === "wholesale" && (
                    <small>Precio mayorista desde {p.wholesale_min} und.</small>
                  )}
                </div>
              </button>
            ))}
          </div>
          {!products.length && <Empty text="No se encontraron productos." />}
        </section>
        <Panel
          title="Venta actual"
          action={<ShoppingCart size={18} />}
          className="cart-panel"
        >
          <div className="cart-settings">
            <Field label="Canal">
              <select
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value);
                  if (e.target.value !== "online" && method === "wompi")
                    setMethod("cash");
                }}
              >
                {Object.entries(channelLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cliente">
              <select
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
              >
                <option value="">Consumidor final</option>
                {data.contacts
                  .filter((c) => c.kind === "customer")
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <div className="cart-lines">
            {!lines.length ? (
              <Empty text="Selecciona productos para comenzar." />
            ) : (
              lines.map((l) => (
                <div className="cart-line" key={l.productId}>
                  <div>
                    <strong>{l.name}</strong>
                    <small>{money(l.unitPrice)} / und.</small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={"Quitar " + l.name}
                    onClick={() =>
                      setCart((c) =>
                        c.filter((i) => i.productId !== l.productId),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="quantity">
                    <button
                      aria-label={"Restar " + l.name}
                      onClick={() =>
                        setCart((c) =>
                          c.map((i) =>
                            i.productId === l.productId
                              ? { ...i, quantity: Math.max(1, i.quantity - 1) }
                              : i,
                          ),
                        )
                      }
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      aria-label={"Cantidad de " + l.name}
                      type="number"
                      min="1"
                      max={available(l.productId)}
                      value={l.quantity}
                      onChange={(e) =>
                        setCart((c) =>
                          c.map((i) =>
                            i.productId === l.productId
                              ? {
                                  ...i,
                                  quantity: Math.min(
                                    available(l.productId),
                                    Math.max(1, Number(e.target.value) || 1),
                                  ),
                                }
                              : i,
                          ),
                        )
                      }
                    />
                    <button
                      aria-label={"Sumar " + l.name}
                      onClick={() => add(l.productId)}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <b>{money(l.total)}</b>
                </div>
              ))
            )}
          </div>
          <div className="cart-summary">
            <div>
              <span>Base sin IVA</span>
              <span>{money(total - tax)}</span>
            </div>
            <div>
              <span>IVA</span>
              <span>{money(tax)}</span>
            </div>
            <div className="cart-total">
              <strong>Total</strong>
              <strong>{money(total)}</strong>
            </div>
            <Field label="Medio de pago">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {Object.entries(methodLabel)
                  .filter(([v]) => v !== "wompi" || channel === "online")
                  .map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
              </select>
            </Field>
            {method === "credit" && (
              <Field label="Fecha de vencimiento">
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </Field>
            )}
            {method === "card" && (
              <p className="form-note">
                Registra el pago después de confirmar la aprobación en el
                datáfono.
              </p>
            )}
            {method === "transfer" && (
              <p className="form-note">
                Registra el pago después de confirmar el abono bancario.
              </p>
            )}
            {method === "wompi" && (
              <p className="form-note">
                Se reserva el stock. La venta se confirma al aprobarse el pago.
              </p>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              className="primary full-button"
              disabled={!lines.length || busy}
              onClick={pay}
            >
              {busy
                ? "Registrando…"
                : method === "wompi"
                  ? "Crear pedido con pago online"
                  : method === "credit"
                    ? "Registrar venta a crédito"
                    : "Registrar pago · " + money(total)}
            </button>
          </div>
        </Panel>
      </div>
      {receipt && (
        <Modal
          title={
            receipt.status === "pending" ? "Pedido creado" : "Venta registrada"
          }
          onClose={() => setReceipt(null)}
        >
          <div className="receipt">
            <h2>{data.org.name}</h2>
            <p>{receipt.number}</p>
            <Badge tone={receipt.status === "pending" ? "amber" : "green"}>
              {receipt.status === "pending" ? "Pago pendiente" : "Registrada"}
            </Badge>
            {receipt.lines.map((l: Row) => (
              <div key={l.productId}>
                <span>
                  {l.quantity} × {l.name}
                </span>
                <strong>{money(l.total)}</strong>
              </div>
            ))}
            <div>
              <strong>Total</strong>
              <strong>{money(receipt.total)}</strong>
            </div>
            <p>Comprobante interno. No es factura electrónica.</p>
          </div>
          <div className="modal-actions">
            <button className="secondary" onClick={() => window.print()}>
              Imprimir
            </button>
            {receipt.status === "pending" && (
              <button
                className="primary"
                onClick={async () => {
                  try {
                    const r = await api(
                      "sales/" + receipt.id + "/checkout",
                      space,
                      {},
                    );
                    window.open(r.url, "_blank", "noopener,noreferrer");
                  } catch (e) {
                    setError((e as Error).message);
                    setReceipt(null);
                  }
                }}
              >
                Abrir pago Wompi
              </button>
            )}
            <button className="secondary" onClick={() => setReceipt(null)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
