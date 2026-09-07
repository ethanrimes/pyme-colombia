import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const origin = process.env.NEXO_TEST_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("This smoke test only creates records on localhost.");
const owner = "smoke-" + randomUUID(),
  org = owner + "-org",
  deviceId = owner + "-device",
  deviceToken = "nx_" + randomBytes(32).toString("hex");
const tokenHash = createHash("sha256").update(deviceToken).digest("hex");
function sql(command) {
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "site-creator-d1",
      "--local",
      "--config",
      "wrangler.local.json",
      "--command",
      command,
    ],
    { stdio: "ignore" },
  );
}
sql(
  `INSERT INTO organizations(id,owner,name,created_at) VALUES('${org}','${owner}','Isolated API test','${new Date().toISOString()}'); INSERT INTO locations(id,org,name) VALUES('${org}-store','${org}','Test store'); INSERT INTO devices(id,org,name,token_hash,created_at,expires_at) VALUES('${deviceId}','${org}','Test device','${tokenHash}','${new Date().toISOString()}','2099-01-01T00:00:00Z');`,
);
const headers = {
  "Content-Type": "application/json",
  "x-nexo-space": "live",
  Authorization: "Bearer " + deviceToken,
};
async function call(path, body, extra = {}) {
  const r = await fetch(origin + "/api/erp/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...headers, ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await r.json();
  return { status: r.status, data: json };
}
const initial = await call("snapshot");
assert.equal(initial.status, 200);
assert.equal(
  initial.data.org.owner,
  owner,
  "Refusing to mutate any non-test organization.",
);
const location = initial.data.locations[0].id;
const product = await call("products", {
  sku: "SMOKE",
  name: "Test product",
  category: "Test",
  cost: 10000,
  price: 23800,
  wholesalePrice: 17850,
  wholesaleMin: 6,
  taxRate: 19,
  minStock: 2,
});
assert.equal(product.status, 200);
await call("inventory", {
  productId: product.data.id,
  locationId: location,
  quantity: 10,
  note: "Test opening",
  idempotencyKey: "opening",
});
const payload = {
  locationId: location,
  channel: "pos",
  paymentMethod: "cash",
  items: [{ productId: product.data.id, quantity: 2 }],
  idempotencyKey: "same-request",
};
const writes = await Promise.all(
  Array.from({ length: 5 }, () => call("sales", payload)),
);
writes.forEach((w) => assert.equal(w.status, 200));
assert.equal(new Set(writes.map((w) => w.data.id)).size, 1);
assert.equal(
  (
    await call("sales", {
      ...payload,
      items: [{ productId: product.data.id, quantity: 100 }],
      idempotencyKey: "oversell",
    })
  ).status,
  409,
);
const after = await call("snapshot");
assert.equal(after.data.sales.length, 1);
assert.equal(after.data.payments.length, 1);
assert.equal(after.data.stock[0].quantity, 8);
assert.equal(after.data.sales[0].tax, 7600);
const deviceSnapshot = await call("snapshot", undefined, {
  "x-nexo-space": "demo",
});
assert.equal(deviceSnapshot.data.org.id, after.data.org.id);
assert.equal(
  (await call("devices", { name: "Forbidden nested key" })).status,
  403,
);
sql(`UPDATE devices SET revoked=1 WHERE id='${deviceId}' AND org='${org}'`);
assert.equal((await call("snapshot")).status, 401);
console.log(
  "API smoke passed: isolated tenant, five concurrent retries, stock rollback, IVA, device scoping and revocation.",
);
