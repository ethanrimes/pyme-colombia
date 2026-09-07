export const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export const sha256 = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
export function equal(a: string, b: string) {
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}
export async function hmacBase64(secret: string, raw: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  );
  return btoa(String.fromCharCode(...bytes));
}
export async function verifyWompi(payload: any, secret: string) {
  const fields = payload.signature?.properties;
  if (
    !Array.isArray(fields) ||
    ![
      "transaction.id",
      "transaction.status",
      "transaction.amount_in_cents",
    ].every((f) => fields.includes(f)) ||
    !Number.isInteger(payload.timestamp)
  )
    return false;
  let value = "";
  for (const path of fields) {
    if (typeof path !== "string" || !/^transaction\.[a-z_]+$/.test(path))
      return false;
    const v = path
      .split(".")
      .reduce((a: any, k: string) => a?.[k], payload.data);
    if (typeof v !== "string" && typeof v !== "number") return false;
    value += v;
  }
  return equal(
    await sha256(value + payload.timestamp + secret),
    String(payload.signature?.checksum || "").toLowerCase(),
  );
}
export async function seal(value: unknown, keyString: string) {
  const bytes = Uint8Array.from(atob(keyString), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...encrypted));
}
export async function unseal(value: string, keyString: string) {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(keyString), (c) => c.charCodeAt(0)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.slice(0, 12) },
        key,
        bytes.slice(12),
      ),
    ),
  );
}
