# Sandbox / staging

Validate your integration before going live. The sandbox mirrors production
request/response shapes but **moves no real money** and does not connect to real PSE /
BRE-B rails — it simulates the expected production behavior end to end.

**Base URL:** `https://api.stg.hellopay.com.co`
**Portal:** `https://portal.stg.hellopay.com.co`

Create a sandbox API key in the portal (**Settings → API Keys**) and send it as
`x-api-key`.

## Driving outcomes with `idNumber`

For both payins and payouts, the **final outcome is determined by
`inlineCustomer.idNumber`**:

| `idNumber` | Result |
| --- | --- |
| `1000000001` | Confirmed |
| `1000000003` | Declined |
| `1000000005` | Canceled |
| any other value | Confirmed (default) |

## Timing

1. Almost immediately: webhook with status `PROCESSING`
   (`payin.processing` / `payout.processing`).
2. ~5 seconds later: the terminal status per the `idNumber` above
   (`confirmed` / `declined` / `canceled`).

## Async `sourceData` (poll for it)

For async payin rails the create response omits some `sourceData` until HelloPay
finishes preparing the flow — the same simulated async behavior as production:

- **PSE** → `sourceData.pseUrl` is `null` right after creation.
- **BRE-B** → depends on `breb.keyType`: `SINGLE_USE` returns the generated
  `keyString`; `QR_CODE` also returns `sourceData.qrString` (base64 QR image).

Poll `GET /payins/{id}` after creation to retrieve updated `sourceData`, or rely on
webhooks.

## Webhook sequence (payins and payouts)

1. `payin.processing` / `payout.processing` — immediately after creation.
2. `payin.confirmed | declined | canceled` for payins.
3. `payout.confirmed | declined | canceled` for payouts.

## Suggested sandbox test matrix

- Confirmed PSE payin (`idNumber: 1000000001`) → assert `payin.confirmed` + `pseUrl`
  populated on poll.
- Declined payin (`idNumber: 1000000003`) → assert `payin.declined`.
- Canceled payin (`idNumber: 1000000005`) → assert `payin.canceled`.
- BRE-B `QR_CODE` payin → assert `qrString` present after polling.
- Confirmed BRE-B payout (`idNumber: 1000000001`) → validate key first, assert
  `payout.confirmed`.
- Payment link → complete it and assert `paymentlink.completed`; let one expire and
  assert `paymentlink.expired`.
