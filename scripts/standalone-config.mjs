import fs from "node:fs";
import path from "node:path";
const databaseId = process.env.NEXO_DATABASE_ID;
if (!databaseId || !/^[0-9a-f-]{36}$/i.test(databaseId))
  throw new Error("Set NEXO_DATABASE_ID to your Cloudflare D1 database ID.");
const root = process.cwd();
const config = {
  name: process.env.NEXO_WORKER_NAME || "nexo-erp",
  main: "./dist/server/index.js",
  compatibility_date: "2026-09-03",
  compatibility_flags: ["nodejs_compat"],
  no_bundle: true,
  assets: { directory: "./dist/client" },
  d1_databases: [
    {
      binding: "DB",
      database_name: process.env.NEXO_DATABASE_NAME || "nexo-erp",
      database_id: databaseId,
      migrations_dir: "./drizzle",
    },
  ],
  vars: {
    TRUST_SITES_IDENTITY: "false",
    ADMIN_ORG_ID: process.env.NEXO_ORG_ID || "nexo-business",
  },
  observability: { enabled: true },
};
fs.writeFileSync(
  path.join(root, ".deployment-config.json"),
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  "Created .deployment-config.json. Configure ADMIN_API_TOKEN_HASH and INTEGRATION_ENCRYPTION_KEY as Worker secrets before deploying.",
);
