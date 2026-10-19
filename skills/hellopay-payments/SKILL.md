---
name: hellopay-payments
description: >-
  Integrate the HelloPay payments API for Colombia (COP): collect payments
  (payins) over PSE, Bre-B, and Nequi; send Bre-B payouts; create hosted
  payment links; validate Bre-B keys; read ledger balance and entries; generate
  reports; and handle webhooks. Use when building or debugging a HelloPay
  integration: creating a payin, payout, or payment link, choosing PSE, Bre-B,
  or Nequi, polling async transactions, wiring webhook events (payin.*,
  payout.*, paymentlink.*), authenticating with X-API-Key, handling errors, or
  testing in the HelloPay sandbox.
license: Proprietary
metadata:
  source: https://docs.hellopay.com.co
  api-version: "1.0"
  vendor: HelloPay
---

# HelloPay Payments Integration

HelloPay is a payin and payout platform for Colombia (more of Latin America is
planned). Use this skill to **collect** payments (payins), **send** payments
(payouts), generate **hosted payment links**, and reconcile through the
**ledger**, **reports**, and **webhooks**.

The API is REST + JSON. Money moves **asynchronously**: the create response is
the *initial* state (`PENDING`), never the final result. Always confirm results
through **webhooks** (preferred) or by **polling**.

## Non-negotiable rules

1. Authenticate with the **`X-API-Key`** header. Never `Authorization: Bearer`.
2. Build against the **sandbox** first: `https://api.stg.hellopay.com.co`.
3. Send **`amountInCents`** as an integer (`100000` = 1,000 COP). Responses and
   webhooks return `amount` in **pesos** (`amountInCents / 100`).
4. Never fulfill an order from the create response or the `callbackUrl`
   redirect. Only from a final status (`CONFIRMED`) or `paymentlink.completed`.
5. `reference` is **not unique** and there is **no idempotency key**. Before
   retrying a create that timed out, search `GET /payins?reference=...` or
   `GET /payouts?reference=...`.
6. The API **rejects unknown fields** (`400`). Send only documented fields; for
   example, never send a `nequi` object on a payin.
7. Call HelloPay from the backend only. Keep the key in `HELLOPAY_API_KEY`.

## Environments and base URLs

| Environment | API base URL | Portal |
| --- | --- | --- |
| Sandbox / staging | `https://api.stg.hellopay.com.co` | `https://portal.stg.hellopay.com.co` |
| Production | `https://api.hellopay.com.co` | `https://portal.hellopay.com.co` |

Keys are per environment. Create them in the portal under **Settings → API
Keys** (shown only once). `401` = missing or invalid key. `403` = the request IP
is not in the organization's IP allowlist.

## Core concepts

- **`amountInCents`**: integer ≥ 1 (payment links: ≥ 100). `currency`: `COP`.
- **`rail`**: payins `PSE` | `BRE_B` | `NEQUI`; payouts `BRE_B` (the API also
  accepts `TRANSFIYA` and `NEQUI`, enabled on request).
- **`inlineCustomer`** (required on payins and payouts; payer or receiver):
  `{ name, idType, idNumber, email, phone }`, all required. `idType` ∈ `CO_CC`,
  `CO_CE`, `CO_NIT`, `PASSPORT`, `MXN_RFC`. `phone` must match `^\+573\d{9}$`.
- **`callbackUrl`**: browser return URL after a hosted flow. Not proof of payment.
- **Status**: `PENDING` → `PROCESSING` → `CONFIRMED` | `DECLINED` | `CANCELED`.
  There is no `EXPIRED` payin status: after the expiry window (Bre-B 20 min,
  PSE 30 min, Nequi 15 min) HelloPay checks the rail and the payin is confirmed
  or `DECLINED` (e.g. `NEQUI_PAYIN_EXPIRED`); PSE can stay in progress longer.
  A rail rejection at start goes `PENDING` → `DECLINED` with no `processing`
  webhook. Payment links: `PENDING` →
  `COMPLETED` | `EXPIRED` (1 hour).
- **`sourceData`** (payins): rail data, partly filled **after** creation.
  **`targetData`** (payouts): the destination.

## Decide which flow to build

| Goal | Use | Reference |
| --- | --- | --- |
| Collect money with your own UI | `POST /payins` (`PSE`, `BRE_B`, `NEQUI`) | [references/payins.md](references/payins.md) |
| Collect money on a HelloPay-hosted page | `POST /payment-links` | [references/payment-links.md](references/payment-links.md) |
| Send money to a Bre-B key | `POST /payouts` | [references/payouts.md](references/payouts.md) |
| Learn the real outcome of a transaction | Webhooks (+ polling) | [references/webhooks.md](references/webhooks.md) |
| Handle a 4xx or an `errorCode` | Error formats and codes | [references/errors.md](references/errors.md) |
| Check balance or reconcile | `GET /ledger/*`, `POST /reports` | [references/api-catalog.md](references/api-catalog.md) |
| Test outcomes | Sandbox `idNumber` values | [references/sandbox.md](references/sandbox.md) |

## Quickstart

### 1. Create a payin

PSE needs a `pse` object and redirects the payer to their bank. Bre-B needs
`breb: { keyType }` and returns a key or QR. Nequi uses `inlineCustomer.phone`
and needs no extra object.

```typescript
const res = await fetch("https://api.stg.hellopay.com.co/payins", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": process.env.HELLOPAY_API_KEY! },
  body: JSON.stringify({
    amountInCents: 100000,
    currency: "COP",
    rail: "PSE",
    reference: "INV-2026-001",
    inlineCustomer: {
      name: "John Doe", idType: "CO_CC", idNumber: "1000000001",
      email: "john.doe@example.com", phone: "+573001234567",
    },
    pse: { bank: "CO_BANCOLOMBIA", personType: "INDIVIDUAL" },
    callbackUrl: "https://your-app.com/checkout/return",
  }),
});
const payin = await res.json(); // { id, status: "PENDING", sourceData: { pseUrl: null, bank }, ... }
```

Then **poll** `GET /payins/{id}` every 1–2 s (timeout ~60 s) until the field you
need is set: PSE `sourceData.pseUrl`, Bre-B `sourceData.keyString` (and
`qrString` for `QR_CODE`). Nequi returns `sourceData.phone` immediately; just
wait for the final status. Details: [references/payins.md](references/payins.md).

### 2. Create a payout (Bre-B)

```bash
# 1) Validate the destination key (404 = does not exist; do not pay)
curl 'https://api.stg.hellopay.com.co/breb/keys/@alphamunKey01' \
  --header 'X-API-Key: YOUR_API_KEY'

# 2) Create the payout
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

Returns `status: "PENDING"` and `targetData: { keyString }`. The balance must
cover amount + fees. Confirm via `payout.confirmed` / `payout.declined` /
`payout.canceled`. See [references/payouts.md](references/payouts.md).

### 3. Create a payment link

```bash
curl --request POST 'https://api.stg.hellopay.com.co/payment-links' \
  --header 'Content-Type: application/json' \
  --header 'X-API-Key: YOUR_API_KEY' \
  --data '{
    "amountType": "FIXED",
    "reference": "INV-2026-001",
    "amountInCents": 100000,
    "callbackUrl": "https://your-app.com/checkout/return"
  }'
```

Redirect the payer to `paymentLinkUrl`. Links expire after **1 hour**. Use
**`paymentlink.completed` / `paymentlink.expired`** as the source of truth. The
link's payin also sends `payin.processing|confirmed|settled` (with
`data.paymentLinkId` set) but never `payin.declined|canceled`, so ignore
`payin.*` events that carry a `paymentLinkId`. Match link events by
`data.reference`: in `paymentlink.completed`, `paymentLinkId` is currently a short
link code, not the creation id. A link can complete after `paymentlink.expired`.
See
[references/payment-links.md](references/payment-links.md).

## Confirming outcomes

- **Webhooks (recommended).** One URL + one custom auth header per organization
  (portal → **Settings → Webhooks**). No signature: verify your header. Any
  `2xx` within 30 s = delivered; otherwise retried hourly, up to 5 attempts.
  Events raised while no webhook is configured are dropped, not queued.
  Events: `payin.processing|confirmed|settled|declined|canceled`,
  `payout.confirmed|declined|canceled` (no `payout.processing`),
  `paymentlink.completed|expired`. Deduplicate on `event` + `data.id`.
- **Polling.** `GET /payins/{id}` or `GET /payouts/{id}` until `status` is final.

Payloads and a handler: [references/webhooks.md](references/webhooks.md).

## Sandbox outcomes

| `inlineCustomer.idNumber` | Result |
| --- | --- |
| `1000000001` | Confirmed |
| `1000000003` | Declined (`SANDBOX_DECLINED`) |
| `1000000005` | Canceled |
| any other value | Confirmed |

The final status arrives about 5 s after the transaction starts processing.
Details: [references/sandbox.md](references/sandbox.md).

## Endpoint catalog

| Method & path | Purpose |
| --- | --- |
| `POST /payins` | Create a payin |
| `GET /payins` · `GET /payins/{id}` | List (filters: `reference`, `customerIdNumber`) / fetch payins |
| `POST /payouts` | Create a payout |
| `GET /payouts` · `GET /payouts/{id}` | List (same filters) / fetch payouts |
| `POST /payment-links` · `GET /payment-links/{paymentLinkId}` | Create / fetch a hosted payment link |
| `GET /breb/keys/{keyString}` | Resolve a Bre-B key (name, bank, document) |
| `GET /ledger/balance` · `GET /ledger/entries` | Balance and ledger movements |
| `POST /reports` · `GET /reports` · `GET /reports/{id}` | Async CSV reports |

Parameters, pagination, and conventions: [references/api-catalog.md](references/api-catalog.md).
The OpenAPI spec is at `https://docs.hellopay.com.co/openapi.yaml`.

## Drop-in client

[assets/hellopay-client.ts](assets/hellopay-client.ts) is a dependency-free
TypeScript client (native `fetch`) covering auth, payins with polling, payouts,
payment links, Bre-B lookup, reference lookup, and balance. Copy it into the
backend and set `HELLOPAY_API_KEY`.

## Integration checklist

1. Store the API key server-side as `HELLOPAY_API_KEY`; use the sandbox URL first.
2. Send integer `amountInCents` and `currency: "COP"`; display `amount` (pesos).
3. Choose the collection flow: `POST /payins` (own UI) or `POST /payment-links` (hosted).
4. For PSE and Bre-B, poll until `sourceData` is ready before showing it to the payer.
5. Configure a webhook with an auth header; verify it, reply `2xx` fast, process
   idempotently, and never move a final status back to `PROCESSING`.
6. Before retrying a timed-out create, look it up by `reference`.
7. Test confirmed / declined / canceled with the sandbox `idNumber` values.
8. Go live with the production base URL and a production key.
