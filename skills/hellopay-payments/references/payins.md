# Payins (collecting payments)

A **payin** collects money from a payer. Create one with `POST /payins`, choose a
`rail`, and complete the payer-facing flow. Payins are **asynchronous**: the create
response is the initial state, and `sourceData` is filled in shortly after — poll the
payin (or wait for webhooks) before redirecting the payer.

## Endpoints

| Method & path | Purpose |
| --- | --- |
| `POST /payins` | Create a payin |
| `POST /payins/sync` | Create and initiate a payin synchronously (one request) |
| `GET /payins` | List payins (cursor pagination: `cursor`, `pageSize` 1–100, default 10) |
| `GET /payins/{id}` | Fetch a single payin |

## Common request fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `amountInCents` | number | Yes | Integer minor units (cents), ≥ 1 |
| `currency` | string | Yes | `COP` |
| `rail` | string | Yes | `PSE` or `BRE_B` |
| `reference` | string | Yes | Your internal id; echoed in responses & webhooks |
| `inlineCustomer` | object | Yes | Payer identity (see below) |
| `pse` | object | When `rail=PSE` | `{ bank, personType }` |
| `breb` | object | When `rail=BRE_B` | `{ keyType }` |
| `callbackUrl` | string | No | Browser return URL after the flow ends |

`inlineCustomer`: `{ name, idType, idNumber, phone, email }`. `idType` ∈
`CO_CC`, `CO_CE`, `CO_NIT`, `MXN_RFC`, `PASSPORT`.

## General lifecycle

1. `POST /payins` with amount, customer, `rail`, and the method object.
2. HelloPay returns the payin in `PROCESSING` with partial `sourceData`.
3. For async rails, **poll** `GET /payins/{id}` until `sourceData` is populated.
4. Send the payer to the redirect URL / show the key or QR.
5. The payer completes payment.
6. HelloPay sends webhooks (`payin.confirmed` / `payin.declined` / `payin.canceled`)
   and redirects the payer to `callbackUrl`.

> The create response is **not** the final result. Confirm via webhooks. See
> [webhooks.md](webhooks.md).

---

## PSE rail (`rail: "PSE"`)

Bank-redirect flow. The payer authenticates on their Colombian bank's site.

**Extra fields:** `pse.bank` (a supported bank code — see [pse-banks.md](pse-banks.md))
and `pse.personType` ∈ `INDIVIDUAL`, `BUSINESS`.

```bash
curl --location 'https://api.stg.hellopay.com.co/payins' \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: YOUR_API_KEY' \
  --data-raw '{
    "amountInCents": 10000,
    "currency": "COP",
    "rail": "PSE",
    "reference": "1001122",
    "inlineCustomer": {
      "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
      "email": "john.doe@doe.com", "phone": "+573131111111"
    },
    "pse": { "bank": "CO_BANCOLOMBIA", "personType": "INDIVIDUAL" },
    "callbackUrl": "https://portal.hellopay.com.co"
  }'
```

**Async detail:** right after creation `sourceData.pseUrl` is `null`. Poll
`GET /payins/{id}` until `pseUrl` is populated, then redirect the payer there.

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 10000,
  "currency": "COP",
  "status": "PROCESSING",
  "rail": "PSE",
  "reference": "1001122",
  "inlineCustomer": { "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
    "email": "john.doe@doe.com", "phone": "+573131111111" },
  "errorCode": null,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "resultAt": null,
  "organizationId": "123e4567-e89b-12d3-a456-426614174000",
  "sourceData": { "pseUrl": null },
  "callbackUrl": "https://portal.hellopay.com.co"
}
```

---

## BRE-B rail (`rail: "BRE_B"`)

Collect with a BRE-B key. Choose `breb.keyType`:

- `SINGLE_USE` — returns the generated key in `sourceData.keyString`.
- `QR_CODE` — also returns `sourceData.qrString`, a `data:image/png;base64,...`
  payload you can render as a QR.

```bash
curl --location 'https://api.stg.hellopay.com.co/payins' \
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
    "breb": { "keyType": "QR_CODE" },
    "callbackUrl": "https://portal.hellopay.com.co"
  }'
```

Response (`QR_CODE`):

```json
{
  "id": "373b1080-62ec-4e65-a4d3-0158f339ca37",
  "amount": 100,
  "confirmedAmount": null,
  "currency": "COP",
  "status": "PROCESSING",
  "rail": "BRE_B",
  "reference": "1dwDmHerYL5NBQZ",
  "inlineCustomer": { "name": "John Doe", "email": "john.doe@doe.com",
    "phone": "+573137772121", "idType": "CO_CC", "idNumber": "1000000001" },
  "errorCode": null,
  "createdAt": "2026-03-23T22:28:08.724Z",
  "updatedAt": "2026-03-23T22:28:08.729Z",
  "resultAt": null,
  "chargebackAt": null,
  "organizationId": "db6a6f4f-444a-4221-ac32-695998236e50",
  "sourceData": {
    "keyType": "QR_CODE",
    "qrString": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAns...",
    "keyString": "@SANDBOX5AF43BE4F5",
    "checkoutUrl": "https://pay.hellopay.com.co/transaction?payinId=373b1080-...&token=..."
  },
  "callbackUrl": "https://portal.hellopay.com.co"
}
```

`SINGLE_USE` is identical but omits `qrString`.

---

## Polling guidance

Async rails populate `sourceData` after creation:

- **PSE** → wait for `sourceData.pseUrl` (initially `null`).
- **BRE-B** → `SINGLE_USE` returns `keyString`; `QR_CODE` also returns `qrString`.

Poll `GET /payins/{id}` on a short interval until the field you need is non-null and
`status` advances. In the sandbox this update follows the same simulated async
behavior as production, so build polling (or webhooks) into your flow from the start.

## Response fields worth noting

- `status` — `PROCESSING` → `CONFIRMED` | `DECLINED` | `CANCELED`.
- `settlementStatus` — settlement lifecycle (e.g. `PENDING_SETTLEMENT`).
- `confirmedAmount` / `confirmedAmountInCents` — populated once confirmed.
- `errorCode` — non-null when a transaction fails.
- `resultAt` — timestamp of the terminal result; `chargebackAt` if charged back.
- `sourceData` — rail-specific payload (redirect URL, key, QR).
