# Abástelo ERP

[Open the private web app](https://abastelo-erp.sergiow.chatgpt.site).

[Name research and availability checks](docs/NAME-RESEARCH.md).

An operational ERP for Colombian retail and wholesale businesses, with a Spanish web app and native iOS/Android apps. Money is stored in integer COP cents; business dates use `America/Bogota`.

## Included

- Product catalog, barcodes, retail and quantity-based wholesale prices, and configurable IVA.
- Inventory by location, stock adjustments, transfers, movement history, and replenishment alerts.
- POS, online payment orders, customer credit, partial collections, full returns, and internal printable receipts.
- Supplier purchase orders, receipt of goods, weighted average inventory cost, purchase IVA, and accounts payable.
- Customers, suppliers, expenses, CSV bank statement import, and reconciliation against recorded collections/payments.
- Revenue by channel/category/product, gross margin, operating result, ticket size, repeat customers, stock coverage/turnover, and market-basket support/confidence/lift.
- CSV exports for sales, stock, movement history, tax summaries, cash movements, receivables and payables; JSON export of business records.
- Wompi checkout and verified events; signed Shopify and WooCommerce paid-order ingestion; Factus v2 invoice submission and validation. Credentials are encrypted and excluded from exports.
- Separate demonstration and empty business workspaces. Native device credentials are revocable and expire after 90 days.

This is an initial operational implementation. It is not a certified accounting/tax package. The exact working coverage and remaining integration work are listed in [INTEGRATIONS.md](docs/INTEGRATIONS.md). It does not claim that unconfigured providers are connected.

## Run the web app

Node.js 22.13+ is required (Node 24 recommended).

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Open the local URL printed by the server, normally `http://localhost:3000`. Local development provides a development-only owner identity. Do not expose the development server to the public internet. Production does not enable that fallback.

The **Demostración** selector uses a separate database organization populated with sample products and transactions. Switch to **Mi empresa** to start with empty business records. Create products, then enter initial stock through **Inventario → Ajuste**. Enter purchase costs without recoverable IVA and select the applicable purchase IVA separately.

To configure integrations locally, copy `.env.example` to `.env`, set `INTEGRATION_ENCRYPTION_KEY` to 32 random bytes encoded as base64, then copy `.env` to `.dev.vars`. Restart the development server. These files are ignored by Git.

## Native iOS and Android

```sh
cd apps/mobile
npm ci
npm start
# With Xcode / Android Studio installed:
npm run ios
npm run android
```

The mobile app uses actual React Native screens, SecureStore, and native camera barcode scanning. It shares the domain calculations and API with the web app. It supports POS, stock lookup/adjustments, customer creation, sales/credit collections, purchase receipt/payments, expense entry, and reports. Catalog imports, purchase creation, configuration, fiscal issuance, and bulk exports are web workflows.

In the web app, use **Configuración → Autorizar dispositivo**. Enter the API URL and generated key on the phone. For iOS Simulator, use `http://localhost:3000`. For Android Emulator, use `http://10.0.2.2:3000`. Physical devices must use the computer's LAN IP. Plain HTTP is allowed only in development builds; deployed mobile backends require HTTPS.

Expo SDK 55 is pinned to support the installed Xcode 26.1 toolchain. EAS profiles are included for development, preview, and production. Generated native projects can be reproduced with `npx expo prebuild`; they are not committed. App Store / Google Play distribution still requires your developer accounts, signing credentials, and store submissions. See [deployment instructions](docs/DEPLOYMENT.md).

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run build
cd apps/mobile
npm run typecheck
npm run export:native
```

The ledger tests execute the actual SQL migrations and triggers against SQLite. They exercise insufficient stock rollback, idempotent sales and receipts, cross-business references, tax calculations, credit/overpayment, returns, transfers, imports, bank matching, signed webhooks, and confirmed online payments.

## Structure

| Path                                | Purpose                                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| `app/`                              | Web UI and HTTP routes                                        |
| `apps/mobile/`                      | Native iOS / Android application                              |
| `lib/domain.ts`, `lib/analytics.ts` | Shared calculations and validation                            |
| `lib/service.ts`                    | Operational mutations                                         |
| `lib/integrations.ts`               | Provider adapters                                             |
| `db/schema.ts`, `drizzle/`          | D1/SQLite schema and atomic ledger triggers                   |
| `tests/`                            | Ledger and integration-boundary tests                         |
| `docs/`                             | API, provider coverage, deployment, and operating assumptions |

Persistent records live in D1/SQLite, not browser storage. Ledger mutations use transactional batches, prepared statements, unique idempotency keys, stock constraints, and audit entries. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the boundaries to review before a wider business rollout.
