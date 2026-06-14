---
name: hellopay-payments
description: >-
  Integrate the HelloPay payments API for Colombia (COP) — collect payments
  (payins) and send funds (payouts) over the PSE and BRE-B rails, create hosted
  payment links, look up BRE-B / Transfiya keys, read ledger balance and entries,
  generate reports, and handle webhooks. Use when building or debugging a HelloPay
  integration: creating a payin / payout / payment link, choosing PSE vs BRE-B,
  polling async transactions, wiring webhook events (payin.*, payout.*,
  paymentlink.*), authenticating with an X-API-Key, or testing in the HelloPay sandbox.
license: Proprietary
metadata:
  source: HelloPay API Documentation
  api-version: "1.0"
  vendor: HelloPay
---

# HelloPay Payments Integration

HelloPay is a payin and payout platform for Colombia (with Latam expansion planned).
Use this skill to integrate money movement: **collect** payments (payins),
**send** payments (payouts), generate **hosted payment links**, and reconcile via
the **ledger**, **reports**, and **webhooks**.

The API is REST + JSON. Money moves **asynchronously**: the create response is the
*initial* state, never the final outcome. Always confirm results through **webhooks**
(preferred) or by **polling** the transaction.

## Environments & base URLs

| Environment | API base URL | Portal |
| --- | --- | --- |
| Sandbox / staging | `https://api.stg.hellopay.com.co` | `https://portal.stg.hellopay.com.co` |
| Production | `https://api.hellopay.com.co` | `https://portal.hellopay.com.co` |

The **sandbox** mirrors production request/response shapes but moves no real money —
use it to validate end to end. See [references/sandbox.md](references/sandbox.md).

## Authentication

Every request authenticates with an API key in the **`X-API-Key`** header. Create
keys in the portal under **Settings → API Keys** (the secret is shown only once).

```bash
curl --location 'https://api.stg.hellopay.com.co/payins' \
  --header 'x-api-key: YOUR_API_KEY'
```

A missing or invalid key returns **401 Unauthorized**. Never expose the key in
client-side code; call HelloPay from your backend.

## Core concepts

These fields and rules apply across payins, payouts, and payment links:

- **`amountInCents`** — amount in the currency's minor unit (cents). Send an integer
  ≥ 1. Responses echo both `amountInCents` and a human-readable `amount`.
- **`currency`** — currently `COP` only.
- **`rail`** — the payment method. Payins: `PSE`, `BRE_B`. Payouts: `BRE_B`
  (also `TRANSFIYA`). Method-specific details go in a sibling object (`pse`, `breb`,
  `transfiya`).
- **`reference`** — your own idempotency/correlation id; echoed back in responses
  and webhooks. Use it to match events to orders.
- **`inlineCustomer`** — payer/receiver identity (see below).
- **`callbackUrl`** — browser redirect target after a hosted flow ends. It is a
  *return* URL, **not** proof of payment — rely on webhooks for the real result.
- **`status`** — lifecycle: `PENDING`/`PROCESSING` → `CONFIRMED` | `DECLINED` | `CANCELED`.

### `inlineCustomer`

```json
{
  "name": "John Doe",
  "idType": "CO_CC",
  "idNumber": "1000000001",
  "phone": "+573001234567",
  "email": "john.doe@example.com"
}
```

`idType` ∈ `CO_CC` (citizen ID), `CO_CE` (foreigner ID), `CO_NIT` (business tax id),
`MXN_RFC`, `PASSPORT`.

## Decide which flow to build

| Goal | Use | Reference |
| --- | --- | --- |
| Collect money, you build the checkout UI | `POST /payins` (`PSE` or `BRE_B`) | [references/payins.md](references/payins.md) |
| Collect money, HelloPay hosts the checkout | `POST /payment-links` | [references/payment-links.md](references/payment-links.md) |
| Pay money out to a BRE-B / Transfiya account | `POST /payouts` | [references/payouts.md](references/payouts.md) |
| Know the real outcome of any transaction | Webhooks (+ polling) | [references/webhooks.md](references/webhooks.md) |
| Check balance / reconcile movements | `GET /ledger/*`, `POST /reports` | [references/api-catalog.md](references/api-catalog.md) |

## Quickstart

### 1. Create a payin (collect a payment)

Pick a `rail` and include its object. PSE redirects the payer to their bank; BRE-B
returns a key/QR. Both are **async** — `sourceData` fills in after creation, so poll
or wait for webhooks.

```bash
curl --location 'https://api.stg.hellopay.com.co/payins' \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: YOUR_API_KEY' \
  --data-raw '{
    "amountInCents": 10000,
    "currency": "COP",
    "rail": "PSE",
    "reference": "INV-2024-001",
    "inlineCustomer": {
      "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
      "email": "john.doe@example.com", "phone": "+573001234567"
    },
    "pse": { "bank": "CO_BANCOLOMBIA", "personType": "INDIVIDUAL" },
    "callbackUrl": "https://your-app.com/checkout/return"
  }'
```

```typescript
const res = await fetch("https://api.stg.hellopay.com.co/payins", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": process.env.HELLOPAY_API_KEY! },
  body: JSON.stringify({
    amountInCents: 10000,
    currency: "COP",
    rail: "PSE",
    reference: "INV-2024-001",
    inlineCustomer: {
      name: "John Doe", idType: "CO_CC", idNumber: "1000000001",
      email: "john.doe@example.com", phone: "+573001234567",
    },
    pse: { bank: "CO_BANCOLOMBIA", personType: "INDIVIDUAL" },
    callbackUrl: "https://your-app.com/checkout/return",
  }),
});
const payin = await res.json(); // { id, status: "PROCESSING", sourceData: { pseUrl: null }, ... }
```

The create response returns `status: "PROCESSING"` and a partial `sourceData`
(`pseUrl` is `null` for PSE; BRE-B returns the `keyString`/`qrString`). **Poll**
`GET /payins/{id}` until the data you need is populated, then send the payer to it.
Full rail details, response shapes, and PSE bank codes are in
[references/payins.md](references/payins.md) and
[references/pse-banks.md](references/pse-banks.md).

### 2. Create a payout (send money via BRE-B)

Validate the destination key first, then create the payout. Outcome arrives via
webhook.

```bash
# 1) Resolve / validate the destination BRE-B key
curl --location 'https://api.stg.hellopay.com.co/breb/keys/@alphamunKey01' \
  --header 'x-api-key: YOUR_API_KEY'

# 2) Create the payout
curl --location 'https://api.stg.hellopay.com.co/payouts' \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: YOUR_API_KEY' \
  --data-raw '{
    "amountInCents": 10000,
    "currency": "COP",
    "rail": "BRE_B",
    "reference": "OUT-2024-001",
    "inlineCustomer": {
      "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
      "email": "john.doe@example.com", "phone": "+573001234567"
    },
    "breb": { "keyString": "@alphamunKey01" }
  }'
```

Returns `status: "PROCESSING"`. Confirm via `payout.confirmed` / `payout.declined` /
`payout.canceled` webhooks. See [references/payouts.md](references/payouts.md).

### 3. Create a payment link (HelloPay-hosted checkout)

No custom checkout UI needed — redirect the payer to the returned `paymentLinkUrl`.

```bash
curl --request POST \
  --url 'https://api.stg.hellopay.com.co/payment-links' \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: YOUR_API_KEY' \
  --data '{
    "amountType": "FIXED",
    "reference": "INV-2026-001",
    "amountInCents": 100000,
    "callbackUrl": "https://your-app.com/checkout/return",
    "rail": "PSE",
    "pse": { "bank": "CO_BANCOLOMBIA" }
  }'
```

Returns `paymentLinkUrl` (redirect the payer there) and `expiresAt`. **Links expire
after 1 hour.** Payment-link payins fire **`paymentlink.completed` / `paymentlink.expired`**
webhooks — **not** `payin.*` events. See [references/payment-links.md](references/payment-links.md).

## Confirming outcomes: webhooks + polling

The authoritative result is **never** the create response. Use one of:

- **Webhooks (recommended).** Configure a URL + auth header in the portal
  (**Settings → Webhooks**). HelloPay POSTs JSON events and retries hourly up to 10
  times until it gets a `2xx`. Events: `payin.processing|confirmed|canceled|declined`,
  `payout.processing|confirmed|canceled|declined`,
  `paymentlink.completed|expired`. Match events to your orders via `data.reference`.
- **Polling.** `GET /payins/{id}` or `GET /payouts/{id}` until `status` is terminal
  and async `sourceData` is filled.

Full event payloads and a sample handler: [references/webhooks.md](references/webhooks.md).

## Testing in the sandbox

In sandbox the **final outcome is driven by `inlineCustomer.idNumber`**:

| idNumber | Result |
| --- | --- |
| `1000000001` | Confirmed |
| `1000000003` | Declined |
| `1000000005` | Canceled |
| any other value | Confirmed (default) |

`payin.processing`/`payout.processing` fires immediately; the terminal event ~5s
later. Details: [references/sandbox.md](references/sandbox.md).

## Endpoint catalog (principal)

| Method & path | Purpose |
| --- | --- |
| `POST /payins` | Create a payin (collect a payment) |
| `POST /payins/sync` | Create + initiate a payin synchronously |
| `GET /payins` · `GET /payins/{id}` | List / fetch payins |
| `POST /payouts` | Create a payout (send money) |
| `GET /payouts` · `GET /payouts/{id}` | List / fetch payouts |
| `POST /payment-links` · `GET /payment-links/{paymentLinkId}` | Create / fetch a hosted payment link |
| `GET /breb/keys/{keyString}` | Resolve BRE-B key (name, bank, document) |
| `GET /breb/keys/{keyString}/payin-status` | BRE-B intent status for a key |
| `GET /transfiya/target/key` · `GET /transfiya/target/account` | Resolve a Transfiya target |
| `GET /ledger/balance` · `GET /ledger/entries` | Balance and ledger movements |
| `POST /reports` · `GET /reports` · `GET /reports/{id}` | Async CSV reports (MOVEMENTS / PAYINS / PAYOUTS) |

Full parameters, schemas, pagination (cursor & page-based), and error codes:
[references/api-catalog.md](references/api-catalog.md).

## Drop-in client

A minimal, dependency-free (uses native `fetch`) TypeScript client covering auth,
create+poll payin, payout, payment link, BRE-B lookup, and balance is in
[assets/hellopay-client.ts](assets/hellopay-client.ts). Copy it into your backend
and set `HELLOPAY_API_KEY`.

## Integration checklist

1. Create an API key in the portal; store it server-side as `HELLOPAY_API_KEY`.
2. Build against the **sandbox** base URL first.
3. Send `amountInCents` as integer minor units; set `currency: "COP"`.
4. Choose your collection flow: `POST /payins` (own UI) or `POST /payment-links` (hosted).
5. For async rails, **poll** the transaction until `sourceData` is ready before
   redirecting the payer.
6. Configure a **webhook** endpoint (+ auth header) and treat its event as the source
   of truth; return `2xx` quickly and process idempotently using `reference`.
7. Test confirmed/declined/canceled paths with the sandbox `idNumber` values.
8. Swap to the production base URL and a production key to go live.
