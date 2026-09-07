import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Picker } from "@react-native-picker/picker";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  money,
  number,
  priceLines,
  bogotaDate,
  type Snapshot,
  type Row,
} from "../../lib/domain";
import { analyze, dateRange } from "../../lib/analytics";
const teal = "#087f73";
type Credentials = { url: string; token: string };
function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: teal }]}>{title}</Text>
    </Pressable>
  );
}
function Input({
  label,
  value,
  onChangeText,
  numeric = false,
  secure = false,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  numeric?: boolean;
  secure?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={numeric ? "decimal-pad" : "default"}
        secureTextEntry={secure}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.select}>
        <Picker
          selectedValue={value}
          onValueChange={onChange}
          accessibilityLabel={label}
          itemStyle={{ fontSize: 15, height: 110 }}
        >
          {options.map((o) => (
            <Picker.Item key={o.value} label={o.label} value={o.value} />
          ))}
        </Picker>
      </View>
    </View>
  );
}
function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={s.card}>
      {title && <Text style={s.cardTitle}>{title}</Text>}
      {children}
    </View>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.label}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={s.statValue}>
        {value}
      </Text>
    </View>
  );
}
const tabs = [
  ["resumen", "Resumen", "▦"],
  ["inventario", "Stock", "▣"],
  ["pos", "Vender", "＋"],
  ["ventas", "Ventas", "↗"],
  ["mas", "Más", "☰"],
];
const makeKey = () =>
  String(Date.now()) + "-" + Math.random().toString(36).slice(2);
function Nexo() {
  const scanLock = useRef(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null),
    [url, setUrl] = useState(process.env.EXPO_PUBLIC_API_URL || ""),
    [token, setToken] = useState(""),
    [data, setData] = useState<Snapshot | null>(null),
    [tab, setTab] = useState("resumen"),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [location, setLocation] = useState(""),
    [channel, setChannel] = useState("pos"),
    [method, setMethod] = useState("cash"),
    [customer, setCustomer] = useState(""),
    [due, setDue] = useState(bogotaDate(new Date(Date.now() + 30 * 864e5))),
    [cart, setCart] = useState<{ productId: string; quantity: number }[]>([]),
    [saleKey, setSaleKey] = useState(makeKey),
    [formKey, setFormKey] = useState(makeKey),
    [busy, setBusy] = useState(false),
    [scan, setScan] = useState(false),
    [permission, requestPermission] = useCameraPermissions(),
    [modal, setModal] = useState<string | null>(null),
    [form, setForm] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<Row | null>(null);
  useEffect(() => {
    SecureStore.getItemAsync("nexo-credentials")
      .then((saved) => {
        if (saved) {
          const c = JSON.parse(saved);
          setCredentials(c);
          setUrl(c.url);
          setToken(c.token);
          void load(c);
        }
      })
      .catch(() => setError("No se pudo leer el acceso guardado."));
  }, []);
  async function request(path: string, body?: unknown, c = credentials) {
    if (!c) throw new Error("Conecta tu negocio");
    const response = await fetch(
      c.url.replace(/\/$/, "") + "/api/erp/" + path,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + c.token,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error(
        "El servidor requiere inicio de sesión web. Usa la URL del API móvil de la guía de despliegue.",
      );
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "No se pudo completar la operación");
    return result;
  }
  async function load(c = credentials) {
    setLoading(true);
    try {
      const d = await request("snapshot", undefined, c);
      setData(d);
      setLocation((l) => l || d.locations[0]?.id || "");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function connect() {
    setLoading(true);
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" &&
        !(__DEV__ && parsed.protocol === "http:")
      )
        throw new Error("Usa HTTPS en producción.");
      if (!token.trim().startsWith("nx_"))
        throw new Error("Ingresa una clave de dispositivo nx_.");
      const c = { url: url.replace(/\/$/, ""), token: token.trim() };
      const d = await request("snapshot", undefined, c);
      await SecureStore.setItemAsync("nexo-credentials", JSON.stringify(c));
      setCredentials(c);
      setData(d);
      setLocation(d.locations[0]?.id || "");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function write(path: string, body: Row) {
    setBusy(true);
    try {
      const result = await request(path, body);
      await load();
      return result;
    } catch (e) {
      Alert.alert("No se pudo guardar", (e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const range = dateRange("30");
  const a = useMemo(
    () => (data ? analyze(data, range.start, range.end) : null),
    [data, range.start, range.end],
  );
  const lines = data ? priceLines(data.products, cart, channel) : [];
  const total = lines.reduce((a, l) => a + l.total, 0);
  const available = (id: string) =>
    data?.stock.find((i) => i.product_id === id && i.location_id === location)
      ?.quantity || 0;
  const options = (rows: Row[]) =>
    rows.map((r) => ({ value: r.id, label: r.name }));
  function add(id: string) {
    if (busy) return;
    const line = cart.find((i) => i.productId === id);
    if ((line?.quantity || 0) >= available(id)) {
      Alert.alert("Stock insuficiente", "No hay más unidades en esta sede.");
      return;
    }
    setCart((c) =>
      line
        ? c.map((i) =>
            i.productId === id ? { ...i, quantity: i.quantity + 1 } : i,
          )
        : [...c, { productId: id, quantity: 1 }],
    );
  }
  async function sell() {
    const result = await write("sales", {
      locationId: location,
      channel,
      paymentMethod: method,
      customerId: customer || null,
      dueDate: method === "credit" ? due : null,
      items: cart,
      idempotencyKey: saleKey,
    });
    if (result) {
      setCart([]);
      setSaleKey(makeKey());
      setSelected(result);
      setModal("receipt");
    }
  }
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  function open(kind: string, row?: Row) {
    setSelected(row || null);
    setFormKey(makeKey());
    setForm(
      kind === "expense"
        ? { category: "Operación", method: "cash", date: bogotaDate() }
        : kind === "payment"
          ? {
              amount: String(((row?.total || 0) - (row?.paid || 0)) / 100),
              method: "cash",
              reference: row?.number || "",
            }
          : kind === "adjust"
            ? {
                productId: row?.id || "",
                locationId: location,
                quantity: "1",
                note: "",
              }
            : {},
    );
    setModal(kind);
  }
  async function saveForm() {
    let path = "",
      body: Row = {};
    if (modal === "expense") {
      path = "expenses";
      body = {
        ...form,
        amount: Math.round(Number(form.amount) * 100),
        idempotencyKey: formKey,
      };
    }
    if (modal === "contact") {
      path = "contacts";
      body = {
        name: form.name,
        document: form.document || "",
        phone: form.phone || "",
        email: form.email || "",
        kind: "customer",
        city: form.city || "Bogotá",
      };
    }
    if (modal === "payment") {
      path = "payments";
      body = {
        ...(selected?.supplier_id
          ? { purchaseId: selected.id }
          : { saleId: selected?.id }),
        amount: Math.round(Number(form.amount) * 100),
        method: form.method,
        reference: form.reference,
        idempotencyKey: formKey,
      };
    }
    if (modal === "adjust") {
      path = "inventory";
      body = {
        ...form,
        quantity: Number(form.quantity),
        idempotencyKey: formKey,
      };
    }
    if (await write(path, body)) setModal(null);
  }
  if (!credentials)
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={s.login}>
            <Text style={s.brand}>
              nexo<Text style={{ color: teal, fontSize: 18 }}>●</Text>
            </Text>
            <Text style={s.title}>Conectar negocio</Text>
            <Text style={s.body}>
              En la web, abre Configuración → Autorizar dispositivo. Ingresa la
              URL del servidor y la clave generada.
            </Text>
            <Input
              label="URL del API"
              value={url}
              onChangeText={setUrl}
              placeholder="https://erp.tuempresa.co"
            />
            <Input
              label="Clave de dispositivo"
              value={token}
              onChangeText={setToken}
              secure
              placeholder="nx_…"
            />
            {error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            <Button
              title={loading ? "Conectando…" : "Conectar"}
              onPress={connect}
              disabled={loading || !url || !token}
            />
            <Text style={s.small}>
              La clave se guarda en el almacenamiento seguro del teléfono.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <View>
          <Text style={s.brandSmall}>
            nexo<Text style={{ color: teal, fontSize: 18 }}>●</Text>
          </Text>
          <Text style={s.small}>
            {data?.org.name || "Nexo ERP"}
            {data?.org.demo ? " · Demo" : ""}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Actualizar"
          style={{ padding: 12 }}
          onPress={() => load()}
        >
          {loading ? (
            <ActivityIndicator color={teal} />
          ) : (
            <Text style={{ fontSize: 24, color: teal }}>↻</Text>
          )}
        </Pressable>
      </View>
      {error && <Text style={s.error}>{error}</Text>}
      {!data || !a ? (
        <View style={s.content}>
          <ActivityIndicator color={teal} />
          <Button title="Reintentar" onPress={() => load()} />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.content}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => load()}
              tintColor={teal}
            />
          }
        >
          {tab === "resumen" && (
            <>
              <Text style={s.title}>Resumen</Text>
              <Text style={s.small}>
                {range.start} — {range.end} · COP
              </Text>
              <View style={s.stats}>
                <Stat label="Ventas con IVA" value={money(a.total)} />
                <Stat label="Utilidad bruta" value={money(a.profit)} />
                <Stat label="Por cobrar" value={money(a.receivable)} />
                <Stat label="Stock al costo" value={money(a.currentStock)} />
              </View>
              <Button
                title="Nueva venta"
                onPress={() => {
                  setTab("pos");
                  setSearch("");
                }}
              />
              <Card title="Ventas por día">
                <View style={s.bars}>
                  {a.daily.map((d) => (
                    <View
                      key={d.date}
                      accessibilityLabel={d.date + ": " + money(d.total)}
                      style={[
                        s.bar,
                        {
                          height: Math.max(
                            2,
                            (d.total /
                              Math.max(...a.daily.map((d) => d.total), 1)) *
                              130,
                          ),
                        },
                      ]}
                    />
                  ))}
                </View>
                <View style={s.row}>
                  <Text style={s.small}>{range.start}</Text>
                  <Text style={s.small}>{range.end}</Text>
                </View>
              </Card>
              <Card title="Pendientes">
                <Pressable style={s.row} onPress={() => setTab("inventario")}>
                  <Text style={s.body}>Alertas de stock por sede</Text>
                  <Text style={s.amount}>{a.low.length}</Text>
                </Pressable>
                <Pressable style={s.row} onPress={() => setTab("ventas")}>
                  <Text style={s.body}>Ventas por cobrar</Text>
                  <Text style={s.amount}>{a.credit.length}</Text>
                </Pressable>
              </Card>
              <Card title="Productos más vendidos">
                {a.ranked
                  .filter((p) => p.units)
                  .slice(0, 5)
                  .map((p) => (
                    <View style={s.row} key={p.id}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.body}>{p.name}</Text>
                        <Text style={s.small}>{p.units} unidades</Text>
                      </View>
                      <Text style={s.amount}>{money(p.revenue)}</Text>
                    </View>
                  ))}
              </Card>
            </>
          )}
          {["inventario", "pos"].includes(tab) && (
            <>
              <Text style={s.title}>
                {tab === "pos" ? "Punto de venta" : "Inventario"}
              </Text>
              <Select
                label="Sede"
                value={location}
                options={options(data.locations)}
                onChange={(v) => {
                  if (cart.length) {
                    Alert.alert(
                      "Venta en curso",
                      "Termina o vacía la venta antes de cambiar de sede.",
                    );
                    return;
                  }
                  setLocation(v);
                }}
              />
              <View style={s.searchRow}>
                <TextInput
                  accessibilityLabel="Buscar producto"
                  style={[s.input, { flex: 1 }]}
                  placeholder="Nombre, SKU o código"
                  value={search}
                  onChangeText={setSearch}
                />
                <Button
                  title="▥"
                  secondary
                  onPress={async () => {
                    if (!permission?.granted) {
                      const p = await requestPermission();
                      if (!p.granted) {
                        Alert.alert(
                          "Permiso de cámara",
                          "Activa el permiso de cámara para escanear.",
                        );
                        return;
                      }
                    }
                    scanLock.current = false;
                    setScan(true);
                  }}
                />
              </View>
              {tab === "pos" && (
                <Select
                  label="Canal"
                  value={channel}
                  options={[
                    { value: "pos", label: "Retail" },
                    { value: "wholesale", label: "Mayorista" },
                    { value: "online", label: "Online" },
                  ]}
                  onChange={(v) => {
                    setChannel(v);
                    if (v !== "online" && method === "wompi") setMethod("cash");
                  }}
                />
              )}
              {data.products
                .filter((p) =>
                  [p.name, p.sku, p.barcode]
                    .join(" ")
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((p) => (
                  <Pressable
                    style={s.product}
                    key={p.id}
                    accessibilityRole="button"
                    onPress={() =>
                      tab === "pos" ? add(p.id) : open("adjust", p)
                    }
                  >
                    <View style={s.productIcon}>
                      <Text style={{ fontSize: 24, color: "#839d87" }}>▣</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.productName}>{p.name}</Text>
                      <Text style={s.small}>
                        {p.sku} · {available(p.id)} disponibles
                      </Text>
                      <Text style={s.price}>
                        {money(
                          channel === "wholesale" ? p.wholesale_price : p.price,
                        )}
                        {channel === "wholesale"
                          ? " desde " + p.wholesale_min + " und."
                          : ""}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 23, color: teal }}>
                      {tab === "pos" ? "+" : "›"}
                    </Text>
                  </Pressable>
                ))}
              {!data.products.length && (
                <Text style={s.empty}>
                  Agrega productos en la web o importa tu catálogo.
                </Text>
              )}
              {tab === "inventario" && (
                <Text style={s.small}>
                  Toca un producto para registrar un ajuste de inventario.
                </Text>
              )}
              {tab === "pos" && (
                <Card
                  title={
                    "Venta actual · " +
                    cart.reduce((a, l) => a + l.quantity, 0) +
                    " unidades"
                  }
                >
                  {!lines.length ? (
                    <Text style={s.empty}>
                      Selecciona productos para comenzar.
                    </Text>
                  ) : (
                    lines.map((l) => (
                      <View key={l.productId} style={s.cartLine}>
                        <Text style={[s.body, { flex: 1 }]}>{l.name}</Text>
                        <View style={s.stepper}>
                          <Pressable
                            accessibilityLabel={"Restar " + l.name}
                            style={s.step}
                            onPress={() =>
                              setCart((c) =>
                                c
                                  .map((i) =>
                                    i.productId === l.productId
                                      ? { ...i, quantity: i.quantity - 1 }
                                      : i,
                                  )
                                  .filter((i) => i.quantity > 0),
                              )
                            }
                          >
                            <Text style={s.stepText}>−</Text>
                          </Pressable>
                          <Text>{l.quantity}</Text>
                          <Pressable
                            accessibilityLabel={"Sumar " + l.name}
                            style={s.step}
                            onPress={() => add(l.productId)}
                          >
                            <Text style={s.stepText}>+</Text>
                          </Pressable>
                        </View>
                        <Text style={s.amount}>{money(l.total)}</Text>
                      </View>
                    ))
                  )}
                  <Select
                    label="Cliente"
                    value={customer}
                    options={[
                      { value: "", label: "Consumidor final" },
                      ...options(
                        data.contacts.filter((c) => c.kind === "customer"),
                      ),
                    ]}
                    onChange={setCustomer}
                  />
                  <Select
                    label="Medio de pago"
                    value={method}
                    options={[
                      { value: "cash", label: "Efectivo" },
                      { value: "card", label: "Datáfono" },
                      { value: "transfer", label: "Transferencia" },
                      { value: "credit", label: "Crédito" },
                      ...(channel === "online"
                        ? [{ value: "wompi", label: "Wompi" }]
                        : []),
                    ]}
                    onChange={setMethod}
                  />
                  {method === "credit" && (
                    <Input
                      label="Vencimiento (AAAA-MM-DD)"
                      value={due}
                      onChangeText={setDue}
                    />
                  )}
                  <View style={s.row}>
                    <Text style={s.body}>IVA incluido</Text>
                    <Text style={s.body}>
                      {money(lines.reduce((a, l) => a + l.tax, 0))}
                    </Text>
                  </View>
                  <View style={s.row}>
                    <Text style={s.cardTitle}>Total</Text>
                    <Text style={s.total}>{money(total)}</Text>
                  </View>
                  {["card", "transfer"].includes(method) && (
                    <Text style={s.small}>
                      Confirma el pago en el datáfono o banco antes de
                      registrarlo.
                    </Text>
                  )}
                  <Button
                    title={
                      busy
                        ? "Registrando…"
                        : method === "credit"
                          ? "Registrar a crédito"
                          : method === "wompi"
                            ? "Crear pedido online"
                            : "Registrar pago"
                    }
                    onPress={sell}
                    disabled={!cart.length || busy}
                  />
                  <Button
                    title="Vaciar venta"
                    secondary
                    disabled={!cart.length || busy}
                    onPress={() =>
                      Alert.alert(
                        "Vaciar venta",
                        "¿Quitar los productos de la venta?",
                        [
                          { text: "Cancelar" },
                          {
                            text: "Vaciar",
                            style: "destructive",
                            onPress: () => {
                              setCart([]);
                              setSaleKey(makeKey());
                            },
                          },
                        ],
                      )
                    }
                  />
                </Card>
              )}
            </>
          )}
          {tab === "ventas" && (
            <>
              <Text style={s.title}>Ventas y cartera</Text>
              <View style={s.stats}>
                <Stat label="Por cobrar" value={money(a.receivable)} />
                <Stat label="Ventas · 30 días" value={money(a.total)} />
              </View>
              <Input
                label="Buscar venta"
                value={search}
                onChangeText={setSearch}
              />
              {[...data.sales]
                .filter((i) =>
                  i.number.toLowerCase().includes(search.toLowerCase()),
                )
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((i) => (
                  <Pressable
                    style={s.product}
                    key={i.id}
                    onPress={() => {
                      setSelected(i);
                      setModal("receipt");
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.productName}>{i.number}</Text>
                      <Text style={s.small}>
                        {bogotaDate(i.created_at)} ·{" "}
                        {data.contacts.find((c) => c.id === i.customer_id)
                          ?.name || "Consumidor final"}
                      </Text>
                      <Text
                        style={[
                          s.small,
                          { color: i.paid < i.total ? "#ad863e" : teal },
                        ]}
                      >
                        {i.status === "voided"
                          ? "Anulada"
                          : i.status === "pending"
                            ? "Pago pendiente"
                            : i.paid < i.total
                              ? "Saldo " + money(i.total - i.paid)
                              : "Pagada"}
                      </Text>
                    </View>
                    <Text style={s.amount}>{money(i.total)}</Text>
                  </Pressable>
                ))}
            </>
          )}
          {tab === "mas" && (
            <>
              <Text style={s.title}>Operación y reportes</Text>
              {[
                ["contactos", "Clientes"],
                ["compras", "Compras"],
                ["gastos", "Gastos"],
                ["analisis", "Análisis"],
              ].map(([v, l]) => (
                <Button key={v} title={l} secondary onPress={() => setTab(v)} />
              ))}
              <Card title="Acceso del dispositivo">
                <Text style={s.body}>{credentials.url}</Text>
                <Text style={s.small}>{data.org.name}</Text>
                <Button
                  title="Cerrar sesión"
                  secondary
                  onPress={() =>
                    Alert.alert(
                      "Cerrar sesión",
                      "Se eliminará la clave guardada en este teléfono.",
                      [
                        { text: "Cancelar" },
                        {
                          text: "Cerrar sesión",
                          style: "destructive",
                          onPress: async () => {
                            await SecureStore.deleteItemAsync(
                              "nexo-credentials",
                            );
                            setCredentials(null);
                            setData(null);
                            setToken("");
                            setCart([]);
                          },
                        },
                      ],
                    )
                  }
                />
              </Card>
            </>
          )}
          {tab === "contactos" && (
            <>
              <Text style={s.title}>Clientes</Text>
              <Button title="Nuevo cliente" onPress={() => open("contact")} />
              {a.customers.map((c) => (
                <Card key={c.id} title={c.name}>
                  <Text style={s.body}>{c.document || "Sin documento"}</Text>
                  <Text style={s.small}>{c.phone || c.email}</Text>
                  <View style={s.row}>
                    <Text style={s.body}>Saldo</Text>
                    <Text style={s.amount}>{money(c.balance)}</Text>
                  </View>
                </Card>
              ))}
            </>
          )}
          {tab === "compras" && (
            <>
              <Text style={s.title}>Compras</Text>
              <Stat label="Por pagar" value={money(a.owed)} />
              <Text style={s.small}>
                Crea órdenes en la web. Recibe mercancía y registra pagos desde
                aquí.
              </Text>
              {data.purchases.map((p) => (
                <Card key={p.id} title={p.number}>
                  <Text style={s.body}>
                    {data.contacts.find((c) => c.id === p.supplier_id)?.name}
                  </Text>
                  <View style={s.row}>
                    <Text style={s.body}>Total</Text>
                    <Text style={s.amount}>{money(p.total)}</Text>
                  </View>
                  <Text style={s.small}>
                    {p.status === "ordered"
                      ? "Pendiente de recepción"
                      : "Recibida"}{" "}
                    · Saldo {money(p.total - p.paid)}
                  </Text>
                  {p.status === "ordered" ? (
                    <Button
                      title="Recibir mercancía"
                      disabled={busy}
                      onPress={() =>
                        Alert.alert(
                          "Recibir compra",
                          "¿Confirmar recepción completa y sumar las unidades al inventario?",
                          [
                            { text: "Cancelar" },
                            {
                              text: "Recibir",
                              onPress: () =>
                                write("purchases/" + p.id + "/receive", {}),
                            },
                          ],
                        )
                      }
                    />
                  ) : (
                    p.paid < p.total && (
                      <Button
                        title="Registrar pago"
                        onPress={() => open("payment", p)}
                      />
                    )
                  )}
                </Card>
              ))}
              {!data.purchases.length && (
                <Text style={s.empty}>No hay órdenes de compra.</Text>
              )}
            </>
          )}
          {tab === "gastos" && (
            <>
              <Text style={s.title}>Gastos</Text>
              <Button title="Registrar gasto" onPress={() => open("expense")} />
              {[...data.expenses]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((e) => (
                  <View style={s.product} key={e.id}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.productName}>{e.description}</Text>
                      <Text style={s.small}>
                        {e.category} · {bogotaDate(e.created_at)}
                      </Text>
                    </View>
                    <Text style={s.amount}>{money(e.amount)}</Text>
                  </View>
                ))}
            </>
          )}
          {tab === "analisis" && (
            <>
              <Text style={s.title}>Análisis · 30 días</Text>
              <View style={s.stats}>
                <Stat label="Margen bruto" value={number(a.margin) + "%"} />
                <Stat
                  label="Rotación estimada"
                  value={a.turnover === null ? "—" : number(a.turnover) + "×"}
                />
                <Stat label="Ticket promedio" value={money(a.ticket)} />
                <Stat
                  label="Clientes recurrentes"
                  value={number(a.repeatRate) + "%"}
                />
              </View>
              <Card title="Resultado operativo">
                {[
                  ["Ingresos sin IVA", a.revenue],
                  ["Costo de ventas", a.cogs],
                  ["Gastos", a.spending],
                  ["Resultado estimado", a.operating],
                ].map(([l, v]) => (
                  <View style={s.row} key={l}>
                    <Text style={s.body}>{l}</Text>
                    <Text style={s.amount}>{money(Number(v))}</Text>
                  </View>
                ))}
              </Card>
              <Card title="Comprados juntos">
                {a.baskets.slice(0, 5).map((p) => (
                  <View style={s.pair} key={p.a + p.b}>
                    <Text style={s.body}>
                      {p.aName} + {p.bName}
                    </Text>
                    <Text style={s.small}>
                      {p.count} ventas · {number(p.support)}% soporte · lift{" "}
                      {number(p.lift)}×
                    </Text>
                  </View>
                ))}
              </Card>
              <Card title="Gastos por categoría">
                {a.expenseCategories.map((c) => (
                  <View style={s.row} key={c.name}>
                    <Text style={s.body}>{c.name}</Text>
                    <Text style={s.amount}>{money(c.value)}</Text>
                  </View>
                ))}
              </Card>
              <Button
                title="Compartir resumen"
                secondary
                onPress={() =>
                  Share.share({
                    message: `${data.org.name}\n${range.start} a ${range.end}\nVentas con IVA: ${money(a.total)}\nIngresos sin IVA: ${money(a.revenue)}\nUtilidad bruta: ${money(a.profit)}\nGastos: ${money(a.spending)}\nResultado operativo estimado: ${money(a.operating)}\nCartera actual: ${money(a.receivable)}`,
                  })
                }
              />
              <Text style={s.small}>
                Informe gerencial. Ventas anuladas excluidas. Rotación: costo
                vendido / inventario promedio estimado. Los auxiliares CSV están
                disponibles en la web.
              </Text>
            </>
          )}
        </ScrollView>
      )}
      <SafeAreaView edges={["bottom"]} style={s.tabBar}>
        <View style={s.tabRow}>
          {tabs.map(([v, l, icon]) => (
            <Pressable
              key={v}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === v }}
              onPress={() => {
                setTab(v);
                setSearch("");
              }}
              style={s.tab}
            >
              <Text style={[s.tabIcon, tab === v && { color: teal }]}>
                {icon}
              </Text>
              <Text style={[s.tabLabel, tab === v && { color: teal }]}>
                {l}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
      <Modal
        visible={scan}
        animationType="slide"
        onRequestClose={() => setScan(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#142b20" }}>
          <View style={{ padding: 20 }}>
            <Button
              title="Cerrar escáner"
              secondary
              onPress={() => setScan(false)}
            />
          </View>
          {scan && permission?.granted && (
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{
                barcodeTypes: [
                  "ean13",
                  "ean8",
                  "code128",
                  "code39",
                  "upc_a",
                  "upc_e",
                ],
              }}
              onBarcodeScanned={({ data: code }) => {
                if (scanLock.current) return;
                scanLock.current = true;
                setScan(false);
                setSearch(code);
                const p = data?.products.find(
                  (p) => p.barcode === code || p.sku === code,
                );
                if (p && tab === "pos") add(p.id);
                else if (!p)
                  Alert.alert(
                    "Código no encontrado",
                    "No existe un producto con este código.",
                  );
              }}
            />
          )}
          <Text style={{ color: "white", padding: 25, textAlign: "center" }}>
            Coloca el código de barras dentro de la cámara.
          </Text>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={modal !== null}
        animationType="slide"
        onRequestClose={() => setModal(null)}
      >
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <Text style={s.cardTitle}>
              {
                {
                  receipt: "Venta",
                  expense: "Registrar gasto",
                  contact: "Nuevo cliente",
                  payment: "Registrar abono",
                  adjust: "Ajuste de inventario",
                }[modal || ""]
              }
            </Text>
            <Button title="Cerrar" secondary onPress={() => setModal(null)} />
          </View>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView
              contentContainerStyle={s.content}
              keyboardShouldPersistTaps="handled"
            >
              {modal === "receipt" && selected && data && (
                <>
                  <Card title={selected.number}>
                    <Text style={s.body}>{data.org.name}</Text>
                    {data.items
                      .filter((i) => i.sale_id === selected.id)
                      .map((i) => (
                        <View style={s.row} key={i.id}>
                          <Text style={[s.body, { flex: 1 }]}>
                            {i.quantity} × {i.name}
                          </Text>
                          <Text style={s.amount}>{money(i.total)}</Text>
                        </View>
                      ))}
                    <View style={s.row}>
                      <Text style={s.cardTitle}>Total</Text>
                      <Text style={s.total}>{money(selected.total)}</Text>
                    </View>
                    <Text style={s.small}>
                      Comprobante interno. No es factura electrónica.
                    </Text>
                  </Card>
                  {selected.status === "completed" &&
                    selected.paid < selected.total && (
                      <Button
                        title="Registrar abono"
                        onPress={() => open("payment", selected)}
                      />
                    )}
                  <Button
                    title="Compartir comprobante"
                    secondary
                    onPress={() =>
                      Share.share({
                        message: `${data.org.name}\n${selected.number}\n${bogotaDate(selected.created_at)}\nTotal: ${money(selected.total)}\nSaldo: ${money(selected.total - selected.paid)}\nComprobante interno. No es factura electrónica.`,
                      })
                    }
                  />
                  {selected.status === "pending" && (
                    <Button
                      title="Abrir pago Wompi"
                      onPress={async () => {
                        const r = await write(
                          "sales/" + selected.id + "/checkout",
                          {},
                        );
                        if (r) Linking.openURL(r.url);
                      }}
                    />
                  )}
                </>
              )}
              {modal === "contact" &&
                [
                  ["name", "Nombre"],
                  ["document", "Documento / NIT"],
                  ["phone", "Teléfono"],
                  ["email", "Correo"],
                  ["city", "Ciudad"],
                ].map(([k, l]) => (
                  <Input
                    key={k}
                    label={l}
                    value={form[k] || ""}
                    onChangeText={set(k)}
                  />
                ))}
              {modal === "expense" && (
                <>
                  <Input
                    label="Concepto"
                    value={form.description || ""}
                    onChangeText={set("description")}
                  />
                  <Select
                    label="Categoría"
                    value={form.category || "Operación"}
                    options={[
                      "Arriendo",
                      "Servicios",
                      "Logística",
                      "Marketing",
                      "Operación",
                      "Nómina",
                      "Otros",
                    ].map((v) => ({ value: v, label: v }))}
                    onChange={set("category")}
                  />
                  <Input
                    label="Valor (COP)"
                    value={form.amount || ""}
                    numeric
                    onChangeText={set("amount")}
                  />
                  <Input
                    label="Fecha (AAAA-MM-DD)"
                    value={form.date || ""}
                    onChangeText={set("date")}
                  />
                </>
              )}
              {modal === "payment" && (
                <>
                  <Text style={s.body}>
                    {selected?.number} · Saldo{" "}
                    {money((selected?.total || 0) - (selected?.paid || 0))}
                  </Text>
                  <Input
                    label="Abono (COP)"
                    value={form.amount || ""}
                    numeric
                    onChangeText={set("amount")}
                  />
                  <Input
                    label="Referencia"
                    value={form.reference || ""}
                    onChangeText={set("reference")}
                  />
                </>
              )}
              {["expense", "payment"].includes(modal || "") && (
                <Select
                  label="Medio de pago"
                  value={form.method || "cash"}
                  options={[
                    { value: "cash", label: "Efectivo" },
                    { value: "card", label: "Datáfono" },
                    { value: "transfer", label: "Transferencia" },
                  ]}
                  onChange={set("method")}
                />
              )}
              {modal === "adjust" && data && (
                <>
                  <Text style={s.cardTitle}>{selected?.name}</Text>
                  <Select
                    label="Sede"
                    value={form.locationId || location}
                    options={options(data.locations)}
                    onChange={set("locationId")}
                  />
                  <Input
                    label="Unidades a sumar o restar"
                    value={form.quantity || ""}
                    onChangeText={set("quantity")}
                  />
                  <Input
                    label="Motivo"
                    value={form.note || ""}
                    onChangeText={set("note")}
                  />
                  <Text style={s.small}>
                    Usa un valor negativo para descontar unidades.
                  </Text>
                </>
              )}
              {modal !== "receipt" && (
                <Button
                  title={busy ? "Guardando…" : "Guardar"}
                  onPress={saveForm}
                  disabled={busy}
                />
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Nexo />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f8f5" },
  login: {
    padding: 28,
    paddingTop: 70,
    gap: 18,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  brand: {
    fontSize: 58,
    fontWeight: "800",
    color: "#203d31",
    letterSpacing: -3,
    marginBottom: 25,
  },
  brandSmall: {
    fontSize: 30,
    fontWeight: "800",
    color: "#203d31",
    letterSpacing: -1.8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e4ece5",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#203d31",
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  body: { fontSize: 14, lineHeight: 22, color: "#617c6a" },
  small: { fontSize: 11, lineHeight: 18, color: "#81958a" },
  content: {
    padding: 18,
    paddingBottom: 35,
    gap: 15,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },
  field: { gap: 7, marginBottom: 7 },
  label: { fontSize: 12, fontWeight: "500", color: "#63816e" },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dce7dd",
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: "#203d31",
    minHeight: 47,
  },
  select: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dce7dd",
    borderRadius: 9,
    overflow: "hidden",
  },
  button: {
    backgroundColor: teal,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 47,
    marginVertical: 3,
  },
  secondary: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dce7dd",
  },
  buttonText: { color: "white", fontWeight: "600", fontSize: 14 },
  error: {
    fontSize: 13,
    color: "#a85444",
    backgroundColor: "#ffefeb",
    padding: 15,
    lineHeight: 21,
  },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: {
    backgroundColor: "white",
    padding: 17,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#e3ece4",
    flexGrow: 1,
    flexBasis: "46%",
    gap: 9,
  },
  statValue: {
    fontSize: 23,
    fontWeight: "700",
    color: "#203d31",
    letterSpacing: -0.8,
  },
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e3ece4",
    borderRadius: 11,
    padding: 18,
    gap: 13,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#203d31" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#eff3ee",
  },
  amount: { fontSize: 13, fontWeight: "600", color: "#203d31" },
  bars: {
    height: 145,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#dce7de",
  },
  bar: {
    flex: 1,
    backgroundColor: "#93c7ae",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  tabBar: {
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#e3ece4",
  },
  tabRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
    paddingBottom: 5,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 7,
    minHeight: 49,
  },
  tabIcon: { fontSize: 23, color: "#a0b2a5" },
  tabLabel: { fontSize: 10, fontWeight: "600", color: "#a0b2a5" },
  searchRow: { flexDirection: "row", gap: 8 },
  product: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 16,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e3ece4",
    borderRadius: 10,
  },
  productIcon: {
    height: 47,
    width: 43,
    backgroundColor: "#ecf1e6",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  productName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#203d31",
    marginBottom: 4,
  },
  price: { fontSize: 13, fontWeight: "600", color: teal, marginTop: 7 },
  cartLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#e9eee7",
    paddingVertical: 9,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#e3ece4",
    borderRadius: 7,
  },
  step: { paddingHorizontal: 11, paddingVertical: 11, minWidth: 35 },
  stepText: { fontSize: 18, color: teal },
  total: { fontSize: 24, fontWeight: "700", color: "#203d31" },
  empty: { padding: 24, textAlign: "center", fontSize: 13, color: "#81958a" },
  pair: {
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2eb",
    paddingVertical: 12,
  },
});
