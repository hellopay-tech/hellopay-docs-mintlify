# Full API catalog

Base URLs: sandbox `https://api.stg.hellopay.com.co`, production
`https://api.hellopay.com.co`. Auth: `X-API-Key` header on every request. All bodies
and responses are JSON. `401 Unauthorized` on a missing/invalid key; `400` on invalid
input; `404` when a resource isn't found.

## Payins — see [payins.md](payins.md)

| Method & path | Description |
| --- | --- |
| `POST /payins` | Create a payin |
| `POST /payins/sync` | Create + initiate a payin synchronously |
| `GET /payins` | List payins (cursor pagination) |
| `GET /payins/{id}` | Get a payin |

## Payouts — see [payouts.md](payouts.md)

| Method & path | Description |
| --- | --- |
| `POST /payouts` | Create a payout |
| `GET /payouts` | List payouts (cursor pagination) |
| `GET /payouts/{id}` | Get a payout |

## Payment links — see [payment-links.md](payment-links.md)

| Method & path | Description |
| --- | --- |
| `POST /payment-links` | Create a hosted payment link |
| `GET /payment-links/{paymentLinkId}` | Get a payment link |

## BRE-B

| Method & path | Description |
| --- | --- |
| `GET /breb/keys/{keyString}` | Resolve key details (name, document, bank, account) |
| `GET /breb/keys/{keyString}/payin-status` | Get the payin intent status for a key |

`GET /breb/keys/{keyString}` returns `{ details: { name, documentType, documentNumber,
bankAccountNumber, keyString, keyType, bankName } }`.

## Transfiya

| Method & path | Description |
| --- | --- |
| `GET /transfiya/target/key?keyString=...` | Resolve a Transfiya target by key string |
| `GET /transfiya/target/account?bank=...&bankAccountNumber=...&customerDocumentNumber=...` | Resolve a Transfiya target by account |

## Ledger

| Method & path | Description |
| --- | --- |
| `GET /ledger/balance` | Current balance(s) for the organization |
| `GET /ledger/entries` | Ledger entries (cursor pagination) |

`GET /ledger/balance` → array of `{ id, organizationId, currency, availableBalance,
postedBalance, unsettledBalance, createdAt, updatedAt }`.

`GET /ledger/entries` query params: `cursor`, `pageSize` (1–100, default 10),
`payinId` (filter), `payoutId` (filter). Each entry:
`{ id, amount, currency, reason, preAvailableBalance, postAvailableBalance,
prePostedBalance, postPostedBalance, metadata, createdAt, updatedAt }`.

## Reports

Async CSV generation (up to 100,000 records per file). `POST` returns immediately;
poll until `status` is `COMPLETED`, then download via the signed `fileUrls` (valid 1
hour).

| Method & path | Description |
| --- | --- |
| `POST /reports` | Create a report |
| `GET /reports` | List reports (page-based pagination) |
| `GET /reports/{id}` | Get a report |

Request body: `{ type, inputCriteria }` where `type` ∈ `MOVEMENTS`, `PAYINS`,
`PAYOUTS`, and `inputCriteria` = `{ createdAtFrom: "yyyy-MM-dd", createdAtTo:
"yyyy-MM-dd" }`. Response: `{ id, type, status (PENDING | GENERATING | COMPLETED),
inputCriteria, files, fileUrls, organizationId, createdAt }`.

## Additional / advanced

| Method & path | Description |
| --- | --- |
| `POST /payment-wizards` · `GET /payment-wizards` | Payment wizard (predecessor of payment links; prefer payment links for hosted checkout) |
| `POST /pse/process` | Internal PSE processing step |

## Pagination

Two styles are used:

- **Cursor-based** (payins, payouts, ledger entries): query with `cursor` (opaque) and
  `pageSize` (1–100, default 10). Responses include
  `pageInfo: { hasNext, hasPrevious, nextCursor, previousCursor }`. Follow
  `nextCursor` until `hasNext` is false.
- **Page-based** (reports, payment wizards): `page`, `limit`. Responses include a
  `pagination: { page, limit, total, totalPages, hasNext, hasPrev }` object.

## Conventions

- Amounts: send `amountInCents` as integer minor units; responses include
  `amountInCents` and a human-readable `amount`.
- Currency: `COP`.
- Timestamps: ISO-8601 UTC (`...Z`).
- Status lifecycle: `PENDING`/`PROCESSING` → `CONFIRMED` | `DECLINED` | `CANCELED`
  (payins/payouts); `PENDING` → `COMPLETED` | `EXPIRED` (payment links).
- Use your `reference` to correlate transactions and webhook events to your own
  records.
