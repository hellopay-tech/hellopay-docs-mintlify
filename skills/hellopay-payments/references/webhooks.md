# Webhooks

Webhooks are the **authoritative** way to learn a transaction's outcome. HelloPay
sends an HTTP `POST` with a JSON body to the organization's webhook URL on each
status change.

## Setup

1. Portal → **Settings → Webhooks** (sandbox:
   `https://portal.stg.hellopay.com.co/dashboard/settings/web-hook`).
2. Enter the endpoint URL plus a custom **authentication header** name and value
   (for example `X-Webhook-Secret: <random>`). HelloPay sends that header on every
   request. Requests are **not signed**: checking this header is the only
   verification.
3. Save. One URL per organization receives every event type.

## Delivery rules

- Any `2xx` = delivered. HelloPay waits up to **30 s** for the response.
- On failure: retried **every hour**, **5 attempts** in total.
- Events may be duplicated or arrive out of order.
- Events raised while no webhook is configured are dropped, not queued.

## Handling rules

- Verify the auth header; reject otherwise.
- Reply `2xx` fast; do the work in a background job.
- Deduplicate on `event` + `data.id` (or `data.paymentLinkId`).
- Correlate with `data.reference`.
- Never move a final status (`CONFIRMED`/`DECLINED`/`CANCELED`) back to
  `PROCESSING`.
- For long outages, reconcile with `GET /payins` and `GET /payouts`.

## Events

| Event | Meaning |
| --- | --- |
| `payin.processing` | Sent to the rail, waiting for the payer |
| `payin.confirmed` | Paid. Fulfill the order |
| `payin.settled` | Confirmed funds settled in the balance |
| `payin.declined` | Rejected, or expired unpaid |
| `payin.canceled` | Canceled |
| `payout.confirmed` | Funds delivered |
| `payout.declined` | Rejected |
| `payout.canceled` | Canceled |
| `paymentlink.completed` | Payment link paid |
| `paymentlink.expired` | Payment link expired unpaid (1 hour) |

No webhook for `PENDING`. **No `payout.processing`.**

Payment-link payins send `payin.processing`, `payin.confirmed`, and
`payin.settled` (with `data.paymentLinkId` set) but **never** `payin.declined` or
`payin.canceled`. Use `paymentlink.*` as the source of truth and ignore `payin.*`
events that have a `paymentLinkId`.

## Payloads

Envelope: `{ event, resource: "payin" | "payout" | "paymentlink", data }`.
Amounts are pesos (no `amountInCents`). Timestamps are ISO 8601 UTC strings.

### Payin

```json
{
  "event": "payin.confirmed",
  "resource": "payin",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "paymentLinkId": null,
    "reference": "INV-2026-001",
    "amount": 1000,
    "confirmedAmount": 1000,
    "currency": "COP",
    "status": "CONFIRMED",
    "rail": "PSE",
    "errorCode": null,
    "sourceData": { "pseUrl": "https://...", "bank": "CO_BANCOLOMBIA" },
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:02:10.000Z",
    "resultAt": "2026-01-01T00:02:10.000Z",
    "chargebackAt": null,
    "settlementAt": null,
    "organizationId": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```

`rail` ∈ `PSE`, `BRE_B`, `NEQUI`. `confirmedAmount` is `0` until confirmed. The
payin webhook does not include
`inlineCustomer` or `callbackUrl`.

### Payout

```json
{
  "event": "payout.confirmed",
  "resource": "payout",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "reference": "OUT-2026-001",
    "amount": 1000,
    "currency": "COP",
    "status": "CONFIRMED",
    "rail": "BRE_B",
    "errorCode": null,
    "targetData": { "keyString": "@alphamunKey01" },
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:05.000Z",
    "resultAt": "2026-01-01T00:00:05.000Z",
    "organizationId": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```

### Payment link

```json
{
  "event": "paymentlink.completed",
  "resource": "paymentlink",
  "data": {
    "paymentLinkId": "4a8f2e1b-7c3d-4e5a-9b6c-8d1f2e3a4b5c",
    "reference": "INV-2026-001",
    "amount": 1000,
    "currency": "COP",
    "status": "COMPLETED",
    "createdAt": "2026-04-20T10:00:00.000Z",
    "updatedAt": "2026-04-20T10:04:20.395Z",
    "expiresAt": "2026-04-20T11:00:00.000Z",
    "completedAt": "2026-04-20T10:04:20.393Z"
  }
}
```

`status` ∈ `COMPLETED`, `EXPIRED`; `completedAt` is `null` when expired. Match
link events to orders by `data.reference`: in `paymentlink.completed`,
`paymentLinkId` is currently a short link code, not the id returned at creation
(`paymentlink.expired` uses the creation id). A link can still complete after
`paymentlink.expired`; treat that as paid.

## Sample handler (Express)

```typescript
app.post("/webhooks/hellopay", express.json(), async (req, res) => {
  if (req.header("X-Webhook-Secret") !== process.env.HELLOPAY_WEBHOOK_SECRET) {
    return res.sendStatus(401);
  }
  const { event, data } = req.body;
  const key = `${event}:${data.id ?? data.paymentLinkId}`;
  if (await alreadyProcessed(key)) return res.sendStatus(200);
  await enqueue(key, event, data); // process in the background
  res.sendStatus(200);
});

async function handle(event: string, data: any) {
  if (event.startsWith("payin.") && data.paymentLinkId) return; // covered by paymentlink.*
  switch (event) {
    case "payin.confirmed":
    case "paymentlink.completed":
      return markOrderPaid(data.reference);
    case "payin.declined":
    case "payin.canceled":
    case "paymentlink.expired":
      return markOrderFailed(data.reference);
    case "payout.confirmed":
      return markPayoutSent(data.reference);
    case "payout.declined":
    case "payout.canceled":
      return markPayoutFailed(data.reference);
  }
}
```
