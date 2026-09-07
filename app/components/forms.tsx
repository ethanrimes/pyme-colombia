"use client";
import { useState, type FormEvent } from "react";
import { Field, Modal } from "./ui";
import {
  money,
  cents,
  bogotaDate,
  type Snapshot,
  type Row,
} from "@/lib/domain";
import { api, methodLabel, download } from "@/lib/client";
import { Plus, Trash2 } from "lucide-react";
export type DialogState = { kind: string; record?: Row };
export function Forms({
  dialog,
  data,
  space,
  onClose,
  onSaved,
}: {
  dialog: DialogState;
  data: Snapshot;
  space: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const r = dialog.record || {},
    kind = dialog.kind;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Row | null>(null),
    [file, setFile] = useState(""),
    [purchaseLines, setPurchaseLines] = useState([
      {
        productId: data.products[0]?.id || "",
        quantity: 1,
        unitCost: (data.products[0]?.cost || 0) / 100,
        taxRate: 0,
      },
    ]);
  const [key] = useState(() => crypto.randomUUID());
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      let path = kind,
        body: Row = {};
      if (kind === "product") {
        path = "products" + (r.id ? "/" + r.id : "");
        body = {
          sku: f.sku,
          name: f.name,
          category: f.category,
          barcode: f.barcode,
          unit: f.unit,
          cost: cents(f.cost),
          price: cents(f.price),
          wholesalePrice: cents(f.wholesalePrice),
          wholesaleMin: Number(f.wholesaleMin),
          taxRate: Number(f.taxRate),
          minStock: Number(f.minStock),
        };
      }
      if (kind === "contact") {
        path = "contacts";
        body = { ...f, kind: r.kind || "customer" };
      }
      if (kind === "inventory" || kind === "transfer") {
        path = "inventory";
        body = {
          productId: f.productId,
          locationId: f.locationId,
          ...(kind === "transfer" ? { toLocationId: f.toLocationId } : {}),
          quantity: Number(f.quantity),
          note: f.note,
          idempotencyKey: key,
        };
      }
      if (kind === "expense") {
        path = "expenses";
        body = { ...f, amount: cents(f.amount), idempotencyKey: key };
      }
      if (kind === "payment") {
        path = "payments";
        body = {
          ...(r.supplier_id ? { purchaseId: r.id } : { saleId: r.id }),
          amount: cents(f.amount),
          method: f.method,
          reference: f.reference,
          idempotencyKey: key,
        };
      }
      if (kind === "purchase") {
        path = "purchases";
        body = {
          supplierId: f.supplierId,
          locationId: f.locationId,
          dueDate: f.dueDate || null,
          items: purchaseLines.map((l) => ({
            ...l,
            unitCost: cents(l.unitCost),
          })),
          idempotencyKey: key,
        };
      }
      if (kind === "integration") {
        path = "integrations/" + r.provider;
        body = { ...f };
      }
      if (kind === "import") {
        path = "import/" + r.type;
        body = { csv: file, preview: !preview };
      }
      if (kind === "location") {
        path = "locations";
        body = { name: f.name };
      }
      if (kind === "device") {
        path = "devices";
        body = { name: f.name };
      }
      if (kind === "invoice") {
        path = "sales/" + r.id + "/invoice";
        body = {
          customer: {
            identification_document_code: f.documentType,
            identification: f.identification,
            names: f.names,
            company: f.company || undefined,
            dv: f.dv || undefined,
            address: f.address,
            email: f.email,
            phone: f.phone,
            legal_organization_code: f.legalType,
            tribute_code: f.tribute,
            municipality_code: f.municipality,
            responsibilities: String(f.responsibilities)
              .split(",")
              .map((x) => x.trim()),
          },
          zeroTaxExcluded: f.excluded === "on",
          confirm: f.confirm === "on",
          preview: !preview,
        };
      }
      const result = await api(path, space, body);
      if (kind === "import" && !result.valid) {
        setError(result.errors.join("\n"));
        return;
      }
      if ((kind === "import" || kind === "invoice") && !preview) {
        setPreview(result);
        return;
      }
      if (kind === "device") {
        setPreview(result);
        return;
      }
      onSaved(
        kind === "import"
          ? `${result.imported} filas importadas. ${result.skipped} omitidas.`
          : "Registro guardado",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const text = (
    name: string,
    label: string,
    defaultValue: string | number = "",
    props: Row = {},
  ) => (
    <Field label={label} key={name}>
      <input name={name} defaultValue={defaultValue} required {...props} />
    </Field>
  );
  const select = (
    name: string,
    label: string,
    options: Row[],
    defaultValue?: string,
  ) => (
    <Field label={label} key={name}>
      <select name={name} defaultValue={defaultValue} required>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
  const locations = data.locations.map((l) => ({ value: l.id, label: l.name }));
  const products = data.products.map((p) => ({
    value: p.id,
    label: p.name + " · " + p.sku,
  }));
  const titles: Record<string, string> = {
    product: r.id ? "Editar producto" : "Nuevo producto",
    contact: r.kind === "supplier" ? "Nuevo proveedor" : "Nuevo cliente",
    inventory: "Ajuste de inventario",
    transfer: "Traslado entre sedes",
    expense: "Registrar gasto",
    payment: "Registrar abono",
    purchase: "Orden de compra",
    integration: "Configurar " + r.title,
    import:
      "Importar " + (r.type === "products" ? "productos" : "extracto bancario"),
    location: "Nueva sede",
    device: "Autorizar dispositivo",
    invoice: "Factura electrónica · Factus",
  };
  return (
    <Modal title={titles[kind] || kind} onClose={onClose}>
      <form onSubmit={submit} className="modal-form">
        <div className="form-grid">
          {kind === "product" && (
            <>
              {text("name", "Nombre", r.name)}
              {text("sku", "SKU", r.sku)}
              {text("barcode", "Código de barras", r.barcode, {
                required: false,
              })}
              {text("category", "Categoría", r.category || "General")}
              {text("unit", "Unidad", r.unit || "und")}
              {text("cost", "Costo unitario (COP)", (r.cost || 0) / 100, {
                type: "number",
                min: 0,
                step: ".01",
                readOnly: !!r.id,
              })}
              {text(
                "price",
                "Precio de venta con IVA (COP)",
                (r.price || 0) / 100,
                { type: "number", min: ".01", step: ".01" },
              )}
              {text(
                "wholesalePrice",
                "Precio mayorista con IVA (COP)",
                (r.wholesale_price || 0) / 100,
                { type: "number", min: ".01", step: ".01" },
              )}
              {text(
                "wholesaleMin",
                "Cantidad mínima mayorista",
                r.wholesale_min || 6,
                { type: "number", min: 1, step: 1 },
              )}
              {select(
                "taxRate",
                "IVA (%)",
                [
                  { value: "0", label: "0%" },
                  { value: "5", label: "5%" },
                  { value: "19", label: "19%" },
                ],
                String(r.tax_rate ?? 19),
              )}
              {text("minStock", "Alerta de stock mínimo", r.min_stock ?? 10, {
                type: "number",
                min: 0,
                step: 1,
              })}
              <p className="form-note full">
                El costo se actualiza al recibir compras. El inventario inicial
                se registra mediante un ajuste.
              </p>
            </>
          )}
          {kind === "contact" && (
            <>
              {text("name", "Nombre o razón social")}
              {text("document", "NIT / documento", "", { required: false })}
              {text("email", "Correo", "", { type: "email", required: false })}
              {text("phone", "Teléfono", "", { required: false })}
              {text("city", "Ciudad", "Bogotá")}
            </>
          )}
          {(kind === "inventory" || kind === "transfer") && (
            <>
              {select("productId", "Producto", products, r.id)}
              {select(
                "locationId",
                kind === "transfer" ? "Sede de origen" : "Sede",
                locations,
              )}
              {kind === "transfer" &&
                select(
                  "toLocationId",
                  "Sede de destino",
                  locations,
                  data.locations[1]?.id,
                )}
              {text(
                "quantity",
                kind === "transfer"
                  ? "Unidades a trasladar"
                  : "Unidades a sumar o restar",
                1,
                {
                  type: "number",
                  min: kind === "transfer" ? 1 : -100000,
                  max: 100000,
                  step: 1,
                },
              )}
              {text("note", "Motivo", "", { minLength: 3 })}
              <p className="form-note full">
                Los movimientos quedan registrados en el historial. Los ajustes
                negativos requieren stock disponible.
              </p>
            </>
          )}
          {kind === "expense" && (
            <>
              {text("description", "Concepto")}
              {select(
                "category",
                "Categoría",
                [
                  "Arriendo",
                  "Servicios",
                  "Logística",
                  "Marketing",
                  "Operación",
                  "Nómina",
                  "Otros",
                ].map((v) => ({ value: v, label: v })),
              )}
              {text("amount", "Valor (COP)", "", {
                type: "number",
                min: ".01",
                step: ".01",
              })}
              {select(
                "method",
                "Medio de pago",
                Object.entries(methodLabel)
                  .slice(0, 3)
                  .map(([value, label]) => ({ value, label })),
              )}
              {text("date", "Fecha", bogotaDate(), { type: "date" })}
            </>
          )}
          {kind === "payment" && (
            <>
              <p className="form-note full">
                {r.number} · Saldo pendiente:{" "}
                <strong>{money(r.total - r.paid)}</strong>
              </p>
              {text("amount", "Abono (COP)", (r.total - r.paid) / 100, {
                type: "number",
                min: ".01",
                max: (r.total - r.paid) / 100,
                step: ".01",
              })}
              {select(
                "method",
                "Medio de pago",
                Object.entries(methodLabel)
                  .slice(0, 3)
                  .map(([value, label]) => ({ value, label })),
              )}
              {text("reference", "Referencia del pago", r.number)}
            </>
          )}
          {kind === "purchase" && (
            <>
              {select("supplierId", "Proveedor", [
                { value: "", label: "Selecciona un proveedor" },
                ...data.contacts
                  .filter((c) => c.kind === "supplier")
                  .map((c) => ({ value: c.id, label: c.name })),
              ])}
              {select("locationId", "Sede de recepción", locations)}
              {text("dueDate", "Vencimiento", "", {
                type: "date",
                required: false,
              })}
              <div className="full purchase-lines">
                {purchaseLines.map((l, i) => (
                  <div key={i}>
                    <select
                      aria-label={"Producto " + (i + 1)}
                      value={l.productId}
                      required
                      onChange={(e) =>
                        setPurchaseLines((lines) =>
                          lines.map((a, j) =>
                            i === j
                              ? {
                                  ...a,
                                  productId: e.target.value,
                                  unitCost:
                                    data.products.find(
                                      (p) => p.id === e.target.value,
                                    )!.cost / 100,
                                }
                              : a,
                          ),
                        )
                      }
                    >
                      {products.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={"Cantidad " + (i + 1)}
                      type="number"
                      min="1"
                      value={l.quantity}
                      onChange={(e) =>
                        setPurchaseLines((lines) =>
                          lines.map((a, j) =>
                            i === j
                              ? { ...a, quantity: Number(e.target.value) }
                              : a,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label={"Costo COP " + (i + 1)}
                      type="number"
                      min="0.01"
                      step=".01"
                      value={l.unitCost}
                      onChange={(e) =>
                        setPurchaseLines((lines) =>
                          lines.map((a, j) =>
                            i === j
                              ? { ...a, unitCost: Number(e.target.value) }
                              : a,
                          ),
                        )
                      }
                    />
                    <select
                      aria-label={"IVA de compra " + (i + 1)}
                      value={l.taxRate}
                      onChange={(e) =>
                        setPurchaseLines((lines) =>
                          lines.map((a, j) =>
                            i === j
                              ? { ...a, taxRate: Number(e.target.value) }
                              : a,
                          ),
                        )
                      }
                    >
                      {[0, 5, 19].map((v) => (
                        <option key={v} value={v}>
                          {v}%
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Quitar línea"
                      disabled={purchaseLines.length === 1}
                      onClick={() =>
                        setPurchaseLines((lines) =>
                          lines.filter((_, j) => i !== j),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setPurchaseLines((l) => [
                      ...l,
                      {
                        productId: data.products[0]?.id || "",
                        quantity: 1,
                        unitCost: (data.products[0]?.cost || 0) / 100,
                        taxRate: 0,
                      },
                    ])
                  }
                >
                  <Plus size={14} /> Agregar producto
                </button>
                <p className="form-note">
                  Cantidad, costo sin IVA (COP) e IVA. Total:{" "}
                  {money(
                    purchaseLines.reduce(
                      (a, l) =>
                        a +
                        l.quantity * cents(l.unitCost) +
                        Math.round(
                          (l.quantity * cents(l.unitCost) * l.taxRate) / 100,
                        ),
                      0,
                    ),
                  )}
                </p>
              </div>
            </>
          )}
          {kind === "integration" && (
            <>
              <p className="form-note full">
                {r.description} Las credenciales se guardan cifradas y no se
                vuelven a mostrar.
              </p>
              {["wompi", "factus"].includes(r.provider) &&
                select("environment", "Ambiente", [
                  { value: "sandbox", label: "Pruebas (sandbox)" },
                  ...(!data.org.demo
                    ? [{ value: "production", label: "Producción" }]
                    : []),
                ])}
              {r.provider === "wompi" && (
                <>
                  {text("publicKey", "Llave pública", "", {
                    autoComplete: "off",
                  })}
                  {text("privateKey", "Llave privada", "", {
                    type: "password",
                    autoComplete: "new-password",
                  })}
                  {text("integritySecret", "Secreto de integridad", "", {
                    type: "password",
                    autoComplete: "new-password",
                  })}
                  {text("eventsSecret", "Secreto de eventos", "", {
                    type: "password",
                    autoComplete: "new-password",
                  })}
                </>
              )}
              {r.provider === "shopify" &&
                text("shopDomain", "Dominio de Shopify", "", {
                  placeholder: "tienda.myshopify.com",
                })}
              {["shopify", "woocommerce"].includes(r.provider) && (
                <>
                  {text("secret", "Secreto de webhook", "", {
                    type: "password",
                    autoComplete: "new-password",
                  })}
                  {select("locationId", "Sede para descontar stock", locations)}
                </>
              )}
              {r.provider === "factus" && (
                <>
                  {text("clientId", "Client ID")}
                  {text("clientSecret", "Client secret", "", {
                    type: "password",
                    autoComplete: "new-password",
                  })}
                  {text("username", "Usuario", "", {
                    type: "email",
                    autoComplete: "off",
                  })}
                  {text("password", "Contraseña", "", {
                    type: "password",
                    autoComplete: "new-password",
                  })}
                  {text("numberingRange", "ID del rango de numeración", "", {
                    type: "number",
                    min: 1,
                  })}
                </>
              )}
              {r.provider !== "factus" && (
                <div className="full">
                  <p className="form-note">
                    URL para eventos. El proveedor debe poder acceder sin una
                    pantalla de inicio de sesión.
                  </p>
                  <code className="endpoint">
                    {typeof window !== "undefined"
                      ? window.location.origin
                      : ""}
                    /api/webhooks/{r.provider}/{data.org.id}
                  </code>
                </div>
              )}
            </>
          )}
          {kind === "import" && (
            <div className="full">
              <p className="form-note">
                CSV con encabezados. Montos en pesos, sin separador de miles;
                punto para decimales. Las filas existentes se omiten.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  download(
                    "plantilla-" + r.type + ".csv",
                    r.type === "products"
                      ? "sku,nombre,categoria,codigo_barras,costo,precio,precio_mayorista,minimo_mayorista,iva,stock_minimo\nCAF-001,Café 500 g,Alimentos,,14900,24900,21900,6,19,10\n"
                      : "id,fecha,descripcion,monto\nBANCO-001," +
                          bogotaDate() +
                          ",Abono cliente,24900\n",
                  )
                }
              >
                Descargar plantilla
              </button>
              <Field label="Archivo CSV">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  required={!file}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 1_000_000) {
                        setError("Máximo 1 MB");
                        return;
                      }
                      setFile(await f.text());
                      setPreview(null);
                      setError("");
                    }
                  }}
                />
              </Field>
              {preview && (
                <div className="import-preview">
                  <strong>
                    {preview.count} filas listas · {preview.skipped} duplicadas
                  </strong>
                  <pre>{JSON.stringify(preview.preview, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
          {kind === "location" && text("name", "Nombre de la sede")}
          {kind === "device" && (
            <>
              {!preview ? (
                text("name", "Nombre del dispositivo", "", {
                  placeholder: "iPhone de caja",
                })
              ) : (
                <div className="full">
                  <p className="form-note">
                    Copia esta clave en la app móvil. Solo se muestra una vez.
                    Vence en 90 días y puedes revocarla desde Configuración.
                  </p>
                  <code className="endpoint">{preview.token}</code>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => navigator.clipboard.writeText(preview.token)}
                  >
                    Copiar clave
                  </button>
                  <p className="form-note">
                    Servidor local para pruebas: usa la IP de este computador,
                    puerto 3000. El acceso remoto requiere un backend accesible
                    por la app.
                  </p>
                </div>
              )}
            </>
          )}
          {kind === "invoice" && (
            <>
              <p className="form-note full">
                Revisa los datos del adquiriente y su RUT. La emisión requiere
                una cuenta Factus habilitada y un rango vigente.
              </p>
              {select("documentType", "Tipo de documento", [
                { value: "13", label: "Cédula de ciudadanía" },
                { value: "31", label: "NIT" },
                { value: "22", label: "Cédula de extranjería" },
                { value: "42", label: "Documento extranjero" },
              ])}
              {text(
                "identification",
                "Número de documento",
                data.contacts.find((c) => c.id === r.customer_id)?.document ||
                  "",
              )}
              {text("dv", "Dígito de verificación", "", {
                required: false,
                maxLength: 1,
              })}
              {text(
                "names",
                "Nombre completo",
                data.contacts.find((c) => c.id === r.customer_id)?.name || "",
              )}
              {text("company", "Razón social", "", { required: false })}
              {text("address", "Dirección")}
              {text(
                "email",
                "Correo",
                data.contacts.find((c) => c.id === r.customer_id)?.email || "",
                { type: "email" },
              )}
              {text("phone", "Teléfono")}
              {select("legalType", "Tipo de persona", [
                { value: "2", label: "Persona natural" },
                { value: "1", label: "Persona jurídica" },
              ])}
              {text("tribute", "Código de tributo DIAN", "ZZ")}
              {text("municipality", "Código DANE del municipio", "", {
                pattern: "[0-9]{5}",
                placeholder: "11001",
              })}
              {text(
                "responsibilities",
                "Responsabilidades RUT, separadas por coma",
                "R-99-PN",
              )}
              <label className="check full">
                <input type="checkbox" name="excluded" /> Productos con IVA 0
                son excluidos (revisar clasificación).
              </label>
              <label className="check full">
                <input type="checkbox" name="confirm" required /> Revisé los
                datos fiscales y autorizo la emisión.
              </label>
              {preview && (
                <div className="full import-preview">
                  <pre>{JSON.stringify(preview.payload, null, 2)}</pre>
                </div>
              )}
            </>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cerrar
          </button>
          {!(kind === "device" && preview) && (
            <button type="submit" className="primary" disabled={busy}>
              {busy
                ? "Guardando…"
                : kind === "import"
                  ? preview
                    ? "Importar filas"
                    : "Revisar archivo"
                  : kind === "invoice"
                    ? preview
                      ? "Emitir factura"
                      : "Revisar factura"
                    : "Guardar"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
