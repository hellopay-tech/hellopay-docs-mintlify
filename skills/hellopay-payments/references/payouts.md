# Payouts (sending money)

A **payout** sends funds from the organization's HelloPay balance to a receiver.
The documented rail is `BRE_B`. The API also accepts `TRANSFIYA` and `NEQUI`;
those must be enabled by HelloPay support, so only use them if the user confirms
they are enabled. Payouts are **asynchronous**: confirm the outcome via webhooks
or polling.

## Endpoints

| Method & path | Purpose |
| --- | --- |
| `GET /breb/keys/{keyString}` | Resolve and validate a Bre-B destination key |
| `POST /payouts` | Create a payout |
| `GET /payouts` | List payouts (cursor pagination; filters `reference`, `customerIdNumber`) |
| `GET /payouts/{id}` | Fetch a single payout |

## Request fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `amountInCents` | integer | Yes | Minor units, ≥ 1. `100000` = 1,000 COP |
| `currency` | string | Yes | `COP` |
| `rail` | string | Yes | `BRE_B` (or `TRANSFIYA` / `NEQUI` when enabled) |
| `reference` | string | Yes | Your payout id; echoed in responses and webhooks; **not unique** |
| `inlineCustomer` | object | Yes | **Receiver** `{ name, idType, idNumber, email, phone }`, all required |
| `breb` | object | When `rail=BRE_B` | `{ keyString }` |
| `transfiya` | object | When `rail=TRANSFIYA` | Exactly one of `keyString` or `account: { bank, bankAccountNumber, customerDocumentNumber }` |
| `nequi` | object | When `rail=NEQUI` | `{ phone }` in `+573XXXXXXXXX` format |

The available balance must cover the amount plus fees, or the request fails with
`400`. Check it with `GET /ledger/balance`.

## Bre-B payout flow

1. **Validate the destination key** with `GET /breb/keys/{keyString}`. Confirm the
   name and document match the intended receiver. `404` → do not pay.
2. `POST /payouts` with `rail: "BRE_B"` and the same `breb.keyString`.
3. The payout is `PENDING`, then `PROCESSING`. **No webhook** is sent for either.
4. Final result via `payout.confirmed` / `payout.declined` / `payout.canceled`, or
   by polling `GET /payouts/{id}`.

### 1. Validate the key

```bash
curl 'https://api.stg.hellopay.com.co/breb/keys/@alphamunKey01' \
  --header 'X-API-Key: YOUR_API_KEY'
```

```json
{
  "details": {
    "name": "John Doe",
    "documentType": "CC",
    "documentNumber": "1234567890",
    "bankAccountNumber": "1234567890",
    "keyString": "@alphamunKey01",
    "keyType": "ALPHANUM",
    "bankName": "BANK TEST"
  }
}
```

### 2. Create the payout

```bash
curl --request POST 'https://api.stg.hellopay.com.co/payouts' \
  --header 'Content-Type: application/json' \
  --header 'X-API-Key: YOUR_API_KEY' \
  --data '{
    "amountInCents": 100000,
    "currency": "COP",
    "rail": "BRE_B",
    "reference": "OUT-2026-001",
    "inlineCustomer": {
      "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
      "email": "john.doe@example.com", "phone": "+573001234567"
    },
    "breb": { "keyString": "@alphamunKey01" }
  }'
```

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 1000,
  "amountInCents": 100000,
  "currency": "COP",
  "status": "PENDING",
  "rail": "BRE_B",
  "reference": "OUT-2026-001",
  "inlineCustomer": { "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
    "email": "john.doe@example.com", "phone": "+573001234567" },
  "errorCode": null,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "resultAt": null,
  "organizationId": "123e4567-e89b-12d3-a456-426614174000",
  "targetData": { "keyString": "@alphamunKey01" }
}
```

- `status: "PENDING"` = accepted, **not** final.
- `targetData` = the destination, without a wrapper object (`{ keyString }` for
  Bre-B, gaining `bank` once processing starts; `{ phone }` for Nequi).
- Payouts use `targetData`, never `sourceData`.

## Never pay twice

There is no idempotency key and `reference` is not unique. If `POST /payouts`
times out or returns `5xx`, call `GET /payouts?reference=OUT-2026-001` first and
only create a new payout if none exists.

## Common payout error codes

`BRE_B_KEY_NOT_FOUND`, `TRANSFIYA_KEY_NOT_FOUND`, `TRANSFIYA_DECLINED`,
`NEQUI_PAYOUT_REJECTED`, `PAYOUT_DECLINED`, `SANDBOX_DECLINED`. See
[errors.md](errors.md).
