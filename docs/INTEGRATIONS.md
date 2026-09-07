# Integration coverage

Documentation checked on September 6, 2026. Provider subscriptions, fiscal habilitation and business credentials are not supplied by this repository. “Configured” means credentials were saved; it does not imply an external connection was verified.

| Source / destination  | Implemented                                                                                                                                                               | Setup and limits                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wompi Colombia        | Server-generated checkout integrity signatures; payment event SHA-256 verification; canonical transaction lookup; amount/currency/reference checks; idempotent settlement | Supply public/private keys and integrity/event secrets for one environment. Configure the webhook. Supports payment methods offered by your Wompi checkout, including available PSE/card/Nequi options. No raw card data is collected. Refunds remain a provider workflow.                                                                |
| Shopify               | HMAC-verified `orders/paid` ingestion, COP amounts, SKU mapping, inventory deduction, deduplication                                                                       | Configure shop domain, webhook secret, and destination location. Catalog must exist first. Discount/tax amounts are read from order lines. Shipping, tips or non-line adjustments that do not reconcile to the order total are rejected for review. No automatic stock push, refund sync, fulfillment or historical backfill yet.         |
| WooCommerce           | HMAC-verified paid order ingestion for `processing` and `completed`, COP, SKU mapping and deduplication                                                                   | Subscribe order-created/updated events. Same catalog and total reconciliation constraints as Shopify. Unpaid/cancelled status updates are ignored; refunds and historical backfill are manual.                                                                                                                                            |
| Factus → DIAN         | OAuth password grant, fiscal preview, `POST /v2/bills/validate`, provider validation state and CUFE recorded                                                              | Requires your Factus account, active numbering range, and verified fiscal buyer data. Submission is explicit. `send_email=false`; Abástelo does not send customer email automatically. Prices are mapped to net unit prices; review rounding and tax treatment in the preview. Credit/debit notes and electronic payroll are not implemented. |
| Excel / Google Sheets | Product CSV import with validation preview and all-or-nothing writes; CSV exports                                                                                         | Download the templates in the app. Amounts in COP pesos, decimal point, no thousands separator. Existing SKUs are skipped. Up to 1,000 rows / 1 MB per import. No live Google Sheets OAuth connector.                                                                                                                                     |
| Banks                 | Normalized CSV statement import; duplicate bank ID checks; exact amount/direction matching to collections and supplier payments                                           | Map the bank's statement columns to `id,fecha,descripcion,monto`. Negative amounts mean money out. There is no direct Bancolombia, Davivienda, BBVA, Belvo, or ACH account connection. Fees, expenses and refund statement lines require manual handling.                                                                                 |
| Accounting / Power BI | Detailed CSV and JSON exports, tax auxiliaries and cash movements                                                                                                         | Map the exports to the target chart of accounts or BI model. Not a native Siigo/Alegra API connection and not an automatic DIAN tax filing.                                                                                                                                                                                               |
| Native devices        | Shared HTTPS API, hashed bearer tokens, SecureStore, revocation/expiration, native camera scan                                                                            | Native apps require an API that does not present a browser-only access gate. See deployment guide.                                                                                                                                                                                                                                        |

## Provider endpoints

- `POST /api/webhooks/wompi/{organizationId}`
- `POST /api/webhooks/shopify/{organizationId}`
- `POST /api/webhooks/woocommerce/{organizationId}`

An organization ID is not an authorization secret. Provider signatures are mandatory. A missing encryption key or integration configuration rejects events. Rejected writes do not alter inventory; the provider can retry after mapping/stock issues are corrected. Successful events appear in the integration activity list; failures are visible in server logs and provider delivery history.

A private Sites preview is behind a browser sign-in gate. It is suitable for private web review, but providers and native clients cannot use that gate as machine authentication. Use the standalone deployment for operational native/webhook access. Do not change the Site to public merely to bypass authentication.

## Additional adapters not yet implemented

Mercado Libre orders/stock, direct Siigo/Alegra journal posting, bank aggregation, supplier EDI, WhatsApp ordering, shipping carriers, electronic payroll, direct DIAN SOAP/XML signing, fulfillment sync, and device-specific fiscal/receipt printer or acquiring terminal protocols. The catalog, events, stable SKU keys, API and export formats provide the points where these adapters can be added.

## Primary references

- [Wompi checkout](https://docs.wompi.co/docs/colombia/widget-checkout-web/)
- [Wompi event signatures](https://docs.wompi.co/docs/colombia/eventos/)
- [Wompi transaction API](https://docs.wompi.co/docs/colombia/transacciones/)
- [Shopify webhooks](https://shopify.dev/docs/apps/build/webhooks)
- [WooCommerce webhook API](https://woocommerce.github.io/woocommerce-rest-api-docs/#webhooks)
- [Factus authentication](https://developers.factus.com.co/autenticacion/auth/)
- [Factus v2 invoice validation](https://developers.factus.com.co/facturas/crear-y-validar/)
- [DIAN habilitation](https://factura-electronica.dian.gov.co/como-habilitarse-15.html)
- [DIAN authorized technology providers](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/proveedores-tecnologicos/)
