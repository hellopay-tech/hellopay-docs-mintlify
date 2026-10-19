# Payins (collecting payments)

A **payin** collects money from a payer. Create one with `POST /payins`, choose a
`rail`, show the payer what they need, and confirm the final status. Payins are
**asynchronous**: the create response is `PENDING`. PSE and Bre-B fill
`sourceData` a few seconds later; Nequi includes the payer's phone immediately.

## Endpoints

| Method & path | Purpose |
| --- | --- |
| `POST /payins` | Create a payin |
| `GET /payins` | List payins (cursor pagination; filters `reference`, `customerIdNumber`) |
| `GET /payins/{id}` | Fetch a single payin (use it to poll) |

## Request fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `amountInCents` | integer | Yes | Minor units, ≥ 1. `100000` = 1,000 COP |
| `currency` | string | Yes | `COP` |
| `rail` | string | Yes | `PSE`, `BRE_B`, or `NEQUI` (must be enabled for the organization) |
| `reference` | string | Yes | Your order id; echoed in responses and webhooks; not unique |
| `inlineCustomer` | object | Yes | Payer `{ name, idType, idNumber, email, phone }`, all required |
| `pse` | object | When `rail=PSE` | `{ bank, personType }`, both required |
| `breb` | object | When `rail=BRE_B` | `{ keyType: "SINGLE_USE" \| "QR_CODE" }` |
| `callbackUrl` | string (URL) | No | Browser return URL after a hosted flow |

`idType` ∈ `CO_CC`, `CO_CE`, `CO_NIT`, `PASSPORT`, `MXN_RFC`. `phone` must match
`^\+573\d{9}$`. Unknown fields (for example a `nequi` object) return `400`.

## Lifecycle

1. `POST /payins` → `status: "PENDING"`, partial `sourceData`. No webhook yet.
2. HelloPay starts the rail → `PROCESSING`, webhook `payin.processing`, and
   `sourceData` is completed.
3. For PSE and Bre-B, **poll** `GET /payins/{id}` until the data you need is set.
4. Redirect the payer (PSE), show the key or QR (Bre-B), or ask them to approve in
   Nequi.
5. Final status → `payin.confirmed` (then `payin.settled`), `payin.declined`, or
   `payin.canceled`.

There is no `EXPIRED` status. After the expiry window (Bre-B 20 min, PSE 30 min,
Nequi 15 min) HelloPay checks the payin with the rail: confirmed if paid, else
`DECLINED` (e.g. `BRE_B_PAYIN_EXPIRED`, `PSE_PAYIN_EXPIRED`,
`NEQUI_PAYIN_EXPIRED`). A PSE payment still in progress at the bank keeps its
status until the bank answers. If the rail rejects the payin at start, it goes
`PENDING` → `DECLINED` (e.g. `VENDOR_REJECTED`) with no `payin.processing`.

## Response shape

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 1000,
  "amountInCents": 100000,
  "confirmedAmount": null,
  "confirmedAmountInCents": null,
  "currency": "COP",
  "status": "PENDING",
  "settlementStatus": null,
  "rail": "PSE",
  "reference": "INV-2026-001",
  "paymentLinkId": null,
  "inlineCustomer": { "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
    "email": "john.doe@example.com", "phone": "+573001234567" },
  "errorCode": null,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "resultAt": null,
  "chargebackAt": null,
  "organizationId": "123e4567-e89b-12d3-a456-426614174000",
  "sourceData": { "pseUrl": null, "bank": "CO_BANCOLOMBIA" },
  "callbackUrl": "https://your-app.com/checkout/return"
}
```

- `amount` / `confirmedAmount` are pesos; `*InCents` are cents. Confirmed amounts
  are `null` until confirmed.
- `settlementStatus`: `null` until confirmed, then `PENDING_SETTLEMENT` → `SETTLED`.
- `errorCode`: set when declined; usually `null` when canceled. See [errors.md](errors.md).
- `resultAt`: when the final status was reached.

---

## PSE (`rail: "PSE"`)

Bank redirect. `pse.bank` is a bank code from [pse-banks.md](pse-banks.md);
`pse.personType` ∈ `INDIVIDUAL`, `BUSINESS`.

```bash
curl --request POST 'https://api.stg.hellopay.com.co/payins' \
  --header 'Content-Type: application/json' \
  --header 'X-API-Key: YOUR_API_KEY' \
  --data '{
    "amountInCents": 100000,
    "currency": "COP",
    "rail": "PSE",
    "reference": "INV-2026-001",
    "inlineCustomer": {
      "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
      "email": "john.doe@example.com", "phone": "+573001234567"
    },
    "pse": { "bank": "CO_BANCOLOMBIA", "personType": "INDIVIDUAL" },
    "callbackUrl": "https://your-app.com/checkout/return"
  }'
```

`sourceData` = `{ pseUrl, bank }`. `pseUrl` is `null` at creation. Poll until it
is set, then redirect the payer there. `personType` is not echoed.

---

## Bre-B (`rail: "BRE_B"`)

Instant payment to a one-time key. `breb.keyType`:

- `SINGLE_USE`: returns `sourceData.keyString`.
- `QR_CODE`: also returns `sourceData.qrString`, a `data:image/png;base64,...`
  image usable directly as `<img src>`.

```bash
curl --request POST 'https://api.stg.hellopay.com.co/payins' \
  --header 'Content-Type: application/json' \
  --header 'X-API-Key: YOUR_API_KEY' \
  --data '{
    "amountInCents": 100000,
    "currency": "COP",
    "rail": "BRE_B",
    "reference": "INV-2026-001",
    "inlineCustomer": {
      "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
      "email": "john.doe@example.com", "phone": "+573001234567"
    },
    "breb": { "keyType": "QR_CODE" },
    "callbackUrl": "https://your-app.com/checkout/return"
  }'
```

`sourceData` = `{ keyType, keyString, qrString?, checkoutUrl }`:

- At creation: `keyString: null`, `checkoutUrl` already set (a HelloPay page that
  shows the key/QR; redirect there if you do not want to render it yourself).
- After polling (`PROCESSING`):

```json
{
  "keyType": "QR_CODE",
  "keyString": "@SANDBOX5AF43BE4F5",
  "qrString": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAns...",
  "checkoutUrl": "https://pay.hellopay.com.co/transaction/.../TOKEN"
}
```

`qrString` is cleared once the payin reaches a final status.

Do not confuse with payouts: payin `breb` takes `keyType`; payout `breb` takes
the receiver's `keyString`.

---

## Nequi (`rail: "NEQUI"`)

Push request to the Nequi account of `inlineCustomer.phone` (`+573XXXXXXXXX`).
No `nequi` object (it is rejected). No redirect, no QR. `callbackUrl` is unused.

```bash
curl --request POST 'https://api.stg.hellopay.com.co/payins' \
  --header 'Content-Type: application/json' \
  --header 'X-API-Key: YOUR_API_KEY' \
  --data '{
    "amountInCents": 100000,
    "currency": "COP",
    "rail": "NEQUI",
    "reference": "INV-2026-001",
    "inlineCustomer": {
      "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
      "email": "john.doe@example.com", "phone": "+573001234567"
    }
  }'
```

`sourceData` = `{ phone }` at creation. Tell the payer to approve in Nequi, then
wait for the final status. Rejected requests → `DECLINED` with
`VENDOR_REJECTED`; unapproved after 15 min → `DECLINED` with
`NEQUI_PAYIN_EXPIRED`.

---

## Polling guidance

| Rail | Wait for | Then |
| --- | --- | --- |
| PSE | `sourceData.pseUrl` ≠ null | Redirect the payer |
| Bre-B | `sourceData.keyString` (and `qrString`) ≠ null | Show key/QR or redirect to `checkoutUrl` |
| Nequi | Nothing | Wait for a final status |

Poll every 1–2 s with a ~60 s timeout. Stop early if `status` becomes `DECLINED`
or `CANCELED`. The sandbox simulates the same async behavior.
