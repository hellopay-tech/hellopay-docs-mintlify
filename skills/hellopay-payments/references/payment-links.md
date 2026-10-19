# Payment links (hosted checkout)

`POST /payment-links` creates a HelloPay-hosted checkout page. Redirect the payer
to the returned `paymentLinkUrl`; they choose a payment method enabled for the
account and pay. No checkout UI or rail-specific polling is needed.

## Endpoints

| Method & path | Purpose |
| --- | --- |
| `POST /payment-links` | Create a payment link |
| `GET /payment-links/{paymentLinkId}` | Fetch a link's state (`PENDING`, `COMPLETED`, `EXPIRED`) |

## How it works

1. `POST /payment-links` with `amountType`, `amountInCents`, `reference`,
   `callbackUrl`, and optional defaults.
2. HelloPay returns `paymentLinkUrl`. Redirect the payer there right away.
3. The payer picks a method and pays on the hosted page.
4. HelloPay sends `paymentlink.completed` (paid) or `paymentlink.expired` (1 hour
   without payment).
5. The payer's browser returns to `callbackUrl` either way.

## Request fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `amountType` | string | Yes | `FIXED` only (charge exactly `amountInCents`) |
| `amountInCents` | integer | Yes | Cents, **minimum 100** |
| `reference` | string | Yes | Your order id; returned in webhooks; not unique |
| `callbackUrl` | string (URL) | Yes | Browser return URL after the flow ends |
| `rail` | string | No | `PSE` or `BRE_B`. **Restricts** the link to that rail. Omit for all enabled methods |
| `inlineCustomer` | object | No | Pre-fill payer data (all five fields) |
| `pse` | object | No | Only when `rail=PSE`. `pse.bank` (required inside `pse`) preselects the bank |

`NEQUI` cannot be set as `rail`. Omit `rail` so the payer can choose Nequi when it
is enabled for the organization. Bre-B link payins always use `QR_CODE`.

## Choosing the flow

| Flow | Send | When |
| --- | --- | --- |
| Open checkout | No optional fields | Payer chooses method and enters details |
| Restricted method | `rail` | Lock to `PSE` or `BRE_B` |
| PSE bank preselected | `rail: "PSE"` + `pse.bank` | You already know the payer's bank |
| Pre-filled payer | `inlineCustomer` | Skip the details form |
| Restricted + pre-filled | `rail` + `inlineCustomer` | You know payer and method |

## Sample request

```bash
curl --request POST 'https://api.stg.hellopay.com.co/payment-links' \
  --header 'Content-Type: application/json' \
  --header 'X-API-Key: YOUR_API_KEY' \
  --data '{
    "amountType": "FIXED",
    "reference": "INV-2026-001",
    "amountInCents": 100000,
    "callbackUrl": "https://your-app.com/checkout/return",
    "rail": "PSE",
    "pse": { "bank": "CO_BANCOLOMBIA" },
    "inlineCustomer": {
      "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
      "email": "john.doe@example.com", "phone": "+573001234567"
    }
  }'
```

## Sample response

```json
{
  "paymentLinkId": "4a8f2e1b-7c3d-4e5a-9b6c-8d1f2e3a4b5c",
  "paymentLinkUrl": "https://pay.hellopay.com.co/link/V1JKU0tQNU02Wklp5lf2gAY8DYXizUKPzcG39x4i_A",
  "status": "PENDING",
  "createdAt": "2026-04-20T10:00:00.000Z",
  "expiresAt": "2026-04-20T11:00:00.000Z",
  "rail": "PSE",
  "inlineCustomer": {
    "name": "John Doe", "idType": "CO_CC", "idNumber": "1000000001",
    "email": "john.doe@example.com", "phone": "+573001234567"
  }
}
```

`rail` and `inlineCustomer` are `null` when not sent.

## Rules

- **Links expire after 1 hour** (`expiresAt`). Never reuse an expired link; create
  a new one.
- `callbackUrl` is UX only, never proof of payment.

## Webhooks — read carefully

| Event | `data.status` | Meaning |
| --- | --- | --- |
| `paymentlink.completed` | `COMPLETED` | Payer paid |
| `paymentlink.expired` | `EXPIRED` | 1 hour passed without payment |

The underlying payin also sends `payin.processing`, `payin.confirmed`, and
`payin.settled` with `data.paymentLinkId` set, but **never** `payin.declined` or
`payin.canceled`. Use `paymentlink.*` as the only signal for link orders and
ignore `payin.*` events that carry a `paymentLinkId`, or the order may be
fulfilled twice.

Correlate events to orders with `data.reference`, not `data.paymentLinkId`: in
`paymentlink.completed` it is currently a short link code, not the id returned at
creation. A link can still complete after `paymentlink.expired`; treat a late
`paymentlink.completed` as paid. `data.amount` is pesos.

```typescript
app.post("/webhooks/hellopay", express.json(), async (req, res) => {
  // Verify the configured auth header first (see webhooks.md).
  const { event, data } = req.body;
  if (event === "paymentlink.completed") await markOrderPaid(data.reference);
  if (event === "paymentlink.expired") await markOrderExpired(data.reference);
  res.sendStatus(200);
});
```

Full payloads: [webhooks.md](webhooks.md).
