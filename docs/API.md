# HTTP API

All business endpoints are under `/api/erp`. Authentication: trusted Sites browser identity, a web access-key session, or `Authorization: Bearer nx_...`. `x-nexo-space: demo|live` selects the space for a Sites owner; device/admin keys are bound to their organization and ignore that selector. JSON amounts are integer COP cents. CSV files use COP pesos.

| Method / path                   | Operation                                                                  |
| ------------------------------- | -------------------------------------------------------------------------- |
| GET `/snapshot`                 | Authorized organization records, sanitized connections and device metadata |
| POST `/products`                | Product catalog entry                                                      |
| POST `/products/{id}`           | Edit catalog/prices; inventory cost changes through purchasing             |
| POST `/contacts`                | Customer or supplier                                                       |
| POST `/locations`               | Inventory location                                                         |
| POST `/inventory`               | Signed adjustment or two-location transfer                                 |
| POST `/sales`                   | POS/wholesale/online order with server-computed prices                     |
| POST `/sales/{id}/void`         | Full cancellation/confirmed manual refund with stock restoration           |
| POST `/sales/{id}/checkout`     | Wompi checkout URL for a pending order                                     |
| POST `/sales/{id}/invoice`      | Factus fiscal preview or explicitly confirmed submission                   |
| POST `/payments`                | Partial/full customer collection or supplier payment                       |
| POST `/purchases`               | Supplier purchase order, net costs and IVA                                 |
| POST `/purchases/{id}/receive`  | Full receipt, atomic cost/stock update                                     |
| POST `/expenses`                | Paid operating expense                                                     |
| POST `/import/products`         | Validate/preview or import product CSV                                     |
| POST `/import/bank`             | Validate/preview or import normalized statement CSV                        |
| POST `/bank/{id}/match`         | Match against a recorded payment                                           |
| POST `/integrations/{provider}` | Owner-only encrypted credential configuration                              |
| POST `/devices`                 | Owner creates a device key; raw key returned once                          |
| POST `/devices/{id}`            | Owner revokes a device                                                     |
| POST `/settings`                | Business contact data                                                      |

Use a stable `idempotencyKey` for retries of sales, movements, payments, purchases, and expenses. Reuse the same key and request after uncertain network failure. Generate a new key only for a new operation. The database protects duplicate financial/stock writes; requests are not silently merged into a different operation.

Example sale:

```json
{
  "locationId": "your-location-id",
  "channel": "wholesale",
  "paymentMethod": "credit",
  "customerId": "your-customer-id",
  "dueDate": "2026-10-01",
  "items": [{ "productId": "your-product-id", "quantity": 12 }],
  "idempotencyKey": "unique-sale-request-id"
}
```

The client supplies product IDs and quantities, not authoritative retail prices, totals or costs. See Zod schemas in `lib/domain.ts` for exact fields and enumerations. Errors use `{ "error": "Spanish user-facing message" }` with 400/401/403/404/409/413/422/500/502/503 status codes as appropriate.

`POST /api/session` exchanges an existing admin/device key for an eight-hour HttpOnly cookie. `DELETE /api/session` clears it. Provider webhooks use their own signature verification and never rely on a user-supplied organization ID for authentication.
