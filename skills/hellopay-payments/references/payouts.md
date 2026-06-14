# Payouts (sending money)

A **payout** sends funds to a receiver. The primary rail is `BRE_B`; the API also
accepts `TRANSFIYA`. Payouts are **asynchronous** — confirm the outcome via webhooks.

## Endpoints

| Method & path | Purpose |
| --- | --- |
| `POST /payouts` | Create a payout |
| `GET /payouts` | List payouts (cursor pagination: `cursor`, `pageSize` 1–100, default 10) |
| `GET /payouts/{id}` | Fetch a single payout |
| `GET /breb/keys/{keyString}` | Resolve/validate a BRE-B destination key |
| `GET /transfiya/target/key` | Resolve a Transfiya target by key string |
| `GET /transfiya/target/account` | Resolve a Transfiya target by bank + account + document |

## Request fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `amountInCents` | number | Yes | Integer minor units (cents), ≥ 1 |
| `currency` | string | Yes | `COP` |
| `rail` | string | Yes | `BRE_B` (or `TRANSFIYA`) |
| `reference` | string | Yes | Your internal id; echoed in responses & webhooks |
| `inlineCustomer` | object | No | Receiver identity `{ name, idType, idNumber, phone, email }` |
| `breb` | object | When `rail=BRE_B` | `{ keyString }` |
| `transfiya` | object | When `rail=TRANSFIYA` | `{ keyString, account: { bank, bankAccountNumber, customerDocumentNumber } }` |

## BRE-B payout flow

1. **Validate the destination key** with `GET /breb/keys/{keyString}` — confirm the
   key exists and belongs to the intended receiver before sending funds.
2. `POST /payouts` with `rail: "BRE_B"` and the same `breb.keyString`.
3. HelloPay creates the payout and processes it asynchronously.
4. Track the result via `payout.confirmed` / `payout.canceled` / `payout.declined`
   webhooks.

### 1. Validate the BRE-B key

```bash
curl --location 'https://api.stg.hellopay.com.co/breb/keys/@alphamunKey01' \
  --header 'x-api-key: YOUR_API_KEY'
```

```json
{
  "details": {
    "name": "John Doe",
    "documentType": "CC",
    "documentNumber": "1234567890",
    "bankAccountNumber": "1234567890",
    "keyString": "3135556666",
    "keyType": "PHONE",
    "bankName": "Bancolombia"
  }
}
```

### 2. Create the payout

```bash
curl --location 'https://api.stg.hellopay.com.co/payouts' \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: YOUR_API_KEY' \
  --data-raw '{
    "amountInCents": 10000,
    "currency": "COP",
    "rail": "BRE_B",
    "reference": "1dwDmHerYL5NBQZ",
    "inlineCustomer": {
      "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
      "email": "john.doe@doe.com", "phone": "+573137772121"
    },
    "breb": { "keyString": "@alphamunKey01" }
  }'
```

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 10000,
  "amountInCents": 10000,
  "currency": "COP",
  "status": "PROCESSING",
  "rail": "BRE_B",
  "reference": "1dwDmHerYL5NBQZ",
  "inlineCustomer": { "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
    "email": "john.doe@doe.com", "phone": "+573137772121" },
  "errorCode": null,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "resultAt": null,
  "organizationId": "123e4567-e89b-12d3-a456-426614174000",
  "targetData": { "breb": { "keyString": "@alphamunKey01" } }
}
```

## Transfiya payout flow

For `rail: "TRANSFIYA"`, resolve the target first, then include a `transfiya` object.
You can resolve a target two ways:

```bash
# By key string
curl --location 'https://api.stg.hellopay.com.co/transfiya/target/key?keyString=@someKey' \
  --header 'x-api-key: YOUR_API_KEY'

# By bank account
curl --location 'https://api.stg.hellopay.com.co/transfiya/target/account?bank=CO_BANCOLOMBIA&bankAccountNumber=1234567890&customerDocumentNumber=1234567890' \
  --header 'x-api-key: YOUR_API_KEY'
```

Then create the payout with:

```json
{
  "amountInCents": 10000,
  "currency": "COP",
  "rail": "TRANSFIYA",
  "reference": "OUT-2024-002",
  "transfiya": {
    "keyString": "transfiya-key-string",
    "account": {
      "bank": "CO_BANCOLOMBIA",
      "bankAccountNumber": "1234567890",
      "customerDocumentNumber": "1234567890"
    }
  }
}
```

## What the response means

- `status: "PROCESSING"` — the payout was created and is in progress, **not** the
  final outcome.
- `targetData` — echoes the destination (e.g. the BRE-B `keyString`).
- Confirm via webhooks: `payout.confirmed`, `payout.canceled`, or `payout.declined`.
  See [webhooks.md](webhooks.md).
