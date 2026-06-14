# Payment links (hosted checkout)

`POST /payment-links` generates a HelloPay-hosted payment page. Instead of building a
checkout UI, redirect the payer to the returned `paymentLinkUrl`, where they pick a
payment method enabled for your account and pay.

## Endpoints

| Method & path | Purpose |
| --- | --- |
| `POST /payment-links` | Create a payment link |
| `GET /payment-links/{paymentLinkId}` | Fetch a link's current state (e.g. check expiry/completion) |

## How it works

1. `POST /payment-links` with the amount, `reference`, `callbackUrl`, and any optional
   checkout defaults.
2. HelloPay returns `paymentLinkUrl` — the full hosted-page URL.
3. Redirect the payer to `paymentLinkUrl`.
4. The payer picks a method and completes payment on the hosted page.
5. HelloPay fires `paymentlink.completed` or `paymentlink.expired`.
6. After the flow, the payer is redirected to your `callbackUrl`.

## Request fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `amountType` | string | Yes | Only `FIXED` is supported (charge exactly `amountInCents`) |
| `amountInCents` | number | Yes | Amount to collect, in cents |
| `reference` | string | Yes | Your internal reference; returned in webhooks |
| `callbackUrl` | string | Yes | Browser return URL after the flow ends |
| `rail` | string | No | `PSE` or `BRE_B`. **Restricts** the link to one rail — the payer can't choose another. Omit to allow all enabled methods |
| `inlineCustomer` | object | No | Pre-fill customer data on the created payin |
| `pse` | object | No | PSE defaults; only send when `rail=PSE`. `pse.bank` preselects the bank |

## Choosing the flow

| Flow | Send | When |
| --- | --- | --- |
| Open checkout | omit optional fields | Payer chooses method & enters details |
| Restricted method | `rail` only | Lock to `PSE` or `BRE_B` |
| PSE bank preselected | `rail: "PSE"` + `pse.bank` | You already know the payer's bank |
| Pre-filled customer | `inlineCustomer` only | Skip asking for details again |
| Restricted + pre-filled | `rail` + `inlineCustomer` | You know payer and method |

## Sample request

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

## Important rules

- **Links expire after 1 hour** (`expiresAt`). Do not reuse an expired link — create a
  new one. Use `GET /payment-links/{paymentLinkId}` to check state before reusing.
- When `rail` is set it **restricts** the link to that rail; the payer cannot pick a
  different method. Omit `rail` for an open checkout.
- Only send the `pse` object when `rail` is `PSE`.

## Webhooks — read this carefully

Payins created through a payment link do **NOT** fire `payin.*` events. The
authoritative signal is the payment-link event:

| Event | `data.status` | Meaning |
| --- | --- | --- |
| `paymentlink.completed` | `COMPLETED` | Payer paid successfully |
| `paymentlink.expired` | `EXPIRED` | 1-hour window elapsed without payment |

Correlate events to your order via `data.reference` (your reference) or
`data.paymentLinkId` (from the create response).

```javascript
app.post('/webhook', (req, res) => {
  const { event, data } = req.body;
  if (event === 'paymentlink.completed' || event === 'paymentlink.expired') {
    const { reference, paymentLinkId, status } = data;
    // Look up the order by reference or paymentLinkId, then mark COMPLETED / EXPIRED.
  }
  res.sendStatus(200);
});
```

Full payloads: [webhooks.md](webhooks.md). The `callbackUrl` redirect is client-side
UX only — always rely on webhooks for authoritative status.
