# Webhooks

Webhooks are the **authoritative** way to learn a transaction's outcome. HelloPay
POSTs a JSON event to your URL when an event occurs and **retries every hour up to 10
times** until it receives a `2xx`. Any `2xx` is treated as delivered.

## Setup

1. Open the portal → **Settings → Webhooks**
   (sandbox: `https://portal.stg.hellopay.com.co/settings/webhooks`).
2. Enter your endpoint URL and the required **authentication header** (HelloPay sends
   this header on every webhook request so you can verify the call is from HelloPay —
   currently the only supported verification method).
3. Save.

## Handling rules

- Respond `2xx` **quickly**; do heavy work asynchronously to avoid retries/timeouts.
- Process **idempotently** — the same event may be delivered more than once. Dedupe on
  `data.id` (or `data.paymentLinkId`) + `event`.
- Correlate to your order via **`data.reference`** (the reference you sent) or the
  resource id.
- Verify the configured auth header before trusting the payload.

## Event payloads

### Payins

```javascript
{
  event: 'payin.processing' | 'payin.confirmed' | 'payin.canceled' | 'payin.declined',
  resource: 'payin',
  data: {
    id: string,
    reference: string | null,
    amount: number,
    currency: 'COP',
    status: 'PROCESSING' | 'CONFIRMED' | 'CANCELED' | 'DECLINED',
    rail: 'BRE_B' | 'PSE',
    sourceData: object,
    errorCode: string | null,
    createdAt: Date,
    updatedAt: Date,
    resultAt: Date | null,
    organizationId: string,
  },
}
```

### Payouts

```javascript
{
  event: 'payout.processing' | 'payout.confirmed' | 'payout.canceled' | 'payout.declined',
  resource: 'payout',
  data: {
    id: string,
    reference: string | null,
    amount: number,
    currency: 'COP',
    status: 'PROCESSING' | 'CONFIRMED' | 'CANCELED' | 'DECLINED',
    rail: 'BRE_B',
    targetData: object,
    errorCode: string | null,
    createdAt: Date,
    updatedAt: Date,
    resultAt: Date | null,
    organizationId: string,
  },
}
```

### Payment links

Fired when a hosted payment link settles. `paymentlink.completed` on a successful
payment; `paymentlink.expired` when the 1-hour window elapses unpaid.

> ⚠️ Payins created via a payment link do **NOT** fire `payin.*` events. Use
> `paymentlink.completed` as the sole authoritative signal for link payments.

```javascript
{
  event: 'paymentlink.completed' | 'paymentlink.expired',
  resource: 'paymentlink',
  data: {
    paymentLinkId: string,      // UUID
    reference: string | null,
    amount: number,
    currency: 'COP',
    status: 'COMPLETED' | 'EXPIRED',
    createdAt: Date,
    updatedAt: Date,
    expiresAt: Date | null,
    completedAt: Date | null,
  },
}
```

## Sample handler (Express)

```javascript
app.post('/webhook', express.json(), (req, res) => {
  // 1. Verify the configured auth header (reject if it doesn't match).
  // 2. Ack fast.
  res.sendStatus(200);

  const { event, resource, data } = req.body;
  switch (event) {
    case 'payin.confirmed':
      // mark order paid (data.reference / data.id)
      break;
    case 'payin.declined':
    case 'payin.canceled':
      // mark order failed
      break;
    case 'payout.confirmed':
      // mark disbursement settled
      break;
    case 'paymentlink.completed':
      // mark hosted-checkout order paid (data.reference / data.paymentLinkId)
      break;
    case 'paymentlink.expired':
      // offer the payer a fresh link
      break;
  }
});
```

## Event sequence

1. `*.processing` fires almost immediately after creation.
2. The terminal event (`confirmed` / `declined` / `canceled`, or
   `completed` / `expired` for links) follows.

You can also confirm a payin by polling `GET /payins/{id}` until `status` is terminal —
choose webhooks or polling per integration; you don't need both.
