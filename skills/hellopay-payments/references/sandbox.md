# Sandbox / staging

Validate the integration before going live. The sandbox uses the same requests
and responses as production but **moves no real money** and does not connect to
PSE, Bre-B, or Nequi. It simulates their async behavior and webhooks.

**Base URL:** `https://api.stg.hellopay.com.co`
**Portal:** `https://portal.stg.hellopay.com.co`

Create a sandbox API key in the portal (**Settings → API Keys**) and send it as
`X-API-Key`. Sandbox keys do not work in production and vice versa.

## Driving outcomes with `idNumber`

For payins and payouts, **`inlineCustomer.idNumber` decides the final status**:

| `idNumber` | Result | Webhook |
| --- | --- | --- |
| `1000000001` | `CONFIRMED` | `payin.confirmed` / `payout.confirmed` |
| `1000000003` | `DECLINED` (`errorCode: SANDBOX_DECLINED`) | `payin.declined` / `payout.declined` |
| `1000000005` | `CANCELED` | `payin.canceled` / `payout.canceled` |
| any other value | `CONFIRMED` | `payin.confirmed` / `payout.confirmed` |

Prefer `1000000001` for success cases so tests are explicit.

## Timing

1. Create → `PENDING` (no webhook).
2. Within seconds → `PROCESSING`. Payins send `payin.processing`; payouts send
   nothing.
3. About **5 s** later → final status from the table, plus its webhook.

## Rail behavior

- **PSE**: `sourceData.pseUrl` is `null` at creation, then a sandbox redirect URL.
- **Bre-B**: `sourceData.keyString` like `@SANDBOX5AF43BE4F5` (null at creation).
  `QR_CODE` also returns a fixed test QR in `sourceData.qrString`.
- **Nequi**: `sourceData.phone` equals `inlineCustomer.phone`; no real Nequi
  request is sent.
- **Bre-B payout**: `targetData.keyString` echoes the destination key. The key
  is not checked (only `idNumber` decides) and `targetData.bank` is not added.
  `GET /breb/keys/@alphamunKey01` resolves in the sandbox; unknown keys return 404.
- Sandbox payouts debit the sandbox balance (amount + fees), like production.

## Suggested test matrix

- PSE payin, `1000000001` → `pseUrl` populated on poll, then `payin.confirmed`.
- Payin, `1000000003` → `payin.declined` with `SANDBOX_DECLINED`.
- Payin, `1000000005` → `payin.canceled`.
- Bre-B `QR_CODE` payin → `qrString` present after polling.
- Nequi payin, `1000000001` → `sourceData.phone` matches, then `payin.confirmed`.
- Bre-B payout, `1000000001` → validate key first, then `payout.confirmed`.
- Payment link → complete one (`paymentlink.completed`); let one expire
  (`paymentlink.expired`).
- Webhook endpoint rejects requests without the configured auth header.
