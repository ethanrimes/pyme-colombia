# Architecture and operating assumptions

## Data and atomicity

D1/SQLite is authoritative. Browser state holds filters, carts and form drafts only. Native SecureStore holds the credential, not authoritative business records. Both clients use the same API. Sales require an online response; there is no offline payment authorization or offline stock guarantee.

A sale, its lines, stock movements, initial payment and audit event commit in one D1 batch. SQL triggers apply inventory movements, reject negative stock, apply payments without exceeding a document total, return cancelled stock, and receive purchases exactly once. Database constraints protect races that cannot safely be handled by an earlier read alone. Products and locations are checked against the request organization. Every query is parameterized.

The initial stock position is an opening adjustment. Purchases update the global product weighted average acquisition cost across locations, excluding the separately entered recoverable IVA. Price changes do not rewrite historical sale-line price/cost snapshots. Transfers do not alter the total number of units. Stock quantities are whole units; fractional/weighted products, lots, expiry dates, serials, bundles and manufacturing are not modeled yet.

The POS computes prices on the server. Wholesale prices apply per SKU when the combined quantity meets that SKU's configured minimum. Retail and wholesale selling prices include IVA. Monetary values are integer COP cents. External order lines preserve the provider's line totals and discounts.

## Lifecycle

- Cash, externally confirmed datáfono/transfer and customer-credit sales are completed on creation.
- A Wompi order reserves stock and remains pending until a verified provider confirmation. Pending orders are not included in revenue. Unpaid reservations are released through explicit cancellation; automatic expiry is not implemented.
- A full cancellation restores stock once. Recorded money refunds are an audit record of an externally confirmed refund, not a payment-gateway refund call. Already electronically invoiced sales and paid Wompi sales are blocked from this operation until handled through the provider's credit-note/refund process.
- Credit collections are partial or full payments against the remaining balance. Purchases add stock only when received. Partial purchase receipt/return is not implemented.
- Bank matching checks organization, amount and incoming/outgoing direction. Each imported bank ID and each matched payment are unique.

## Reports

Revenue and gross margin use completed sales excluding IVA. Receivables and payables use current unpaid balances, regardless of the selected report dates. Reports restate cancelled sales out of their original periods, rather than producing period-locked accounting adjustments. The treasury export separately includes recorded refunds on their dates.

Turnover is an estimate: COGS / mean of opening and closing ledger inventory value. Available stock excludes reserved online orders. Coverage uses units sold per calendar day of the selected period. Repeat-customer rate excludes unidentified consumer-final sales. Basket counts use distinct products per completed transaction; support, directional confidence and lift are exposed with sample sizes.

Operating result is gross profit less entered operating expenses. It does not include depreciation, retained taxes, borrowing costs, accruals or a PUC double-entry general ledger. Tax and treasury exports are accountant auxiliaries, not financial statements or filings. A fiscal specialist must review product treatment, recoverable purchase IVA, rounding, numbering ranges, RUT responsibilities and Factus configuration for the actual business. Mixed exempt/excluded zero-rated invoice lines require finer per-product mapping than the current document-level option.

## Access and deployment

Sites mode trusts authenticated headers only behind the Sites dispatcher when explicitly enabled. Standalone mode ignores those headers and uses an admin hash/bootstrap plus expiring hashed device credentials. Web key sessions use HttpOnly cookies. Mutating browser requests reject cross-origin requests; native bearer calls do not need a browser Origin header. Integration credentials are AES-GCM encrypted with a runtime key and never returned by snapshots or exports. Native apps store device credentials in SecureStore.

This version has an owner role and authorized operational devices. Add employee roles/scopes and organization invitations for multi-user business deployments. The current snapshot API returns the business history as a single snapshot; use server-side report aggregation and pagination before large historical imports. Backups must include both D1 data and the separately protected encryption key. JSON exports omit secrets and are not a full database restore format.

## Verification boundaries

Automated tests run the generated migrations and actual ledger triggers in SQLite. Provider tests use signed fixtures and mocked canonical API responses. No real funds were moved, no DIAN document was emitted, and no business-provider credentials were supplied. Native bundle compilation is distinct from signed store distribution and physical barcode-camera validation.

Known development-tool advisories remain in transitive Drizzle/esbuild and Expo/Xcode/uuid tooling. High-severity scaffold dependency advisories were upgraded away. Do not force a suggested downgrade of the whole framework merely to silence a transitive advisory; review the affected API usage and upstream fixes.
