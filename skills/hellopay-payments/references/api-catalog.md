# API catalog

Base URLs: sandbox `https://api.stg.hellopay.com.co`, production
`https://api.hellopay.com.co`. Auth: `X-API-Key` header on every request. JSON
bodies and responses. Errors: see [errors.md](errors.md). OpenAPI spec:
`https://docs.hellopay.com.co/openapi.yaml`.

## Payins — see [payins.md](payins.md)

| Method & path | Description |
| --- | --- |
| `POST /payins` | Create a payin |
| `GET /payins` | List payins (cursor pagination; `reference`, `customerIdNumber` filters) |
| `GET /payins/{id}` | Get a payin |

## Payouts — see [payouts.md](payouts.md)

| Method & path | Description |
| --- | --- |
| `POST /payouts` | Create a payout |
| `GET /payouts` | List payouts (cursor pagination; `reference`, `customerIdNumber` filters) |
| `GET /payouts/{id}` | Get a payout |

## Payment links — see [payment-links.md](payment-links.md)

| Method & path | Description |
| --- | --- |
| `POST /payment-links` | Create a hosted payment link |
| `GET /payment-links/{paymentLinkId}` | Get a payment link |

## Bre-B

| Method & path | Description |
| --- | --- |
| `GET /breb/keys/{keyString}` | Resolve key details before a payout |

Returns `{ details: { name, documentType, documentNumber, bankAccountNumber,
keyString, keyType, bankName } }`. `404` when the key does not exist.

## Ledger

| Method & path | Description |
| --- | --- |
| `GET /ledger/balance` | Current balance(s) for the organization |
| `GET /ledger/entries` | Ledger entries (cursor pagination; `payinId`, `payoutId` filters) |

`GET /ledger/balance` → array of `{ id, organizationId, currency,
availableBalance, postedBalance, unsettledBalance, balanceByMethod, createdAt,
updatedAt }`. `balanceByMethod` = `[{ method, availableBalance,
unsettledBalance }]` per rail (a method may be negative).

Each ledger entry: `{ id, amount, currency, reason, preAvailableBalance,
postAvailableBalance, prePostedBalance, postPostedBalance, metadata, createdAt,
updatedAt }`.

## Reports

Async CSV generation (up to 100,000 records per file). `POST` returns
immediately; poll `GET /reports/{id}` until `status` is `COMPLETED`, then
download the signed `fileUrls` (valid 1 hour).

| Method & path | Description |
| --- | --- |
| `POST /reports` | Create a report |
| `GET /reports` | List reports (page-based pagination) |
| `GET /reports/{id}` | Get a report |

Body: `{ type, inputCriteria }`, `type` ∈ `MOVEMENTS`, `PAYINS`, `PAYOUTS`,
`SETTLEMENTS`; `inputCriteria` = `{ createdAtFrom: "yyyy-MM-dd", createdAtTo:
"yyyy-MM-dd" }` (from on or before to, at most 31 days).
Response: `{ id, type, status (PENDING | GENERATING | COMPLETED), inputCriteria,
files, fileUrls, organizationId, createdAt }`.

## Pagination

- **Cursor-based** (payins, payouts, ledger entries): `cursor` (opaque) and
  `pageSize` (1–100, default 10). Response `pageInfo: { hasNext, hasPrevious,
  nextCursor, previousCursor }`. Pass `nextCursor` as `cursor` until `hasNext`
  is false.
- **Page-based** (reports): `page`, `limit`. Response
  `pagination: { page, limit, total, totalPages, hasNext, hasPrev }`.

## Conventions

- Amounts: send integer `amountInCents`; responses include `amountInCents` and
  `amount` (pesos). Webhooks include only `amount`.
- Currency: `COP`. Timestamps: ISO 8601 UTC (`...Z`).
- Status: `PENDING` → `PROCESSING` → `CONFIRMED` | `DECLINED` | `CANCELED`
  (payins, payouts); `PENDING` → `COMPLETED` | `EXPIRED` (payment links).
- `reference` correlates transactions and webhooks to your records. It is not
  unique; there is no idempotency-key header.
- Unknown request fields are rejected with `400`.
