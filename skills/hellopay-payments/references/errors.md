# Errors

Two kinds of failure:

- **Request errors**: the HTTP call fails (4xx/5xx).
- **Transaction errors**: the call succeeded, but the payin or payout later became
  `DECLINED` or `CANCELED`. For `DECLINED` the reason is in `errorCode` (response
  and webhook); `CANCELED` usually has `errorCode: null`. Branch on `status`.

## Request error format

```json
{ "statusCode": 400, "message": ["inlineCustomer.phone must start with +573 and be followed by 9 digits"], "error": "Bad Request" }
```

`message` is an **array** for validation errors and a **string** otherwise
(`"The breb object is required when rail is BRE_B"`). Handle both. `error` may be
absent (`401` with a missing key, `403`, `"Insufficient balance"`).

| Status | Cause | Action |
| --- | --- | --- |
| `400` | Invalid body/params, unknown field, rail not enabled, insufficient balance (payouts) | Fix the request; do not retry unchanged |
| `401` | `"Unauthorized"` = missing `X-API-Key`; `"Invalid API key"` = wrong or revoked key | Check key and environment |
| `403` | IP not in the organization's allowlist | Call from an allowed IP |
| `404` | Resource not found or not owned by the organization | Check the id |
| `500` | Unexpected server error | Look up by `reference` before retrying |

## Validation rules that commonly fail

- `amountInCents`: integer ≥ 1 (payment links ≥ 100).
- `currency`: `COP`.
- `inlineCustomer`: required on payins and payouts, every field required.
- `inlineCustomer.name` (payins): letters only, no digits or URLs, ≤ 120 chars.
- Payment links: `pse` only allowed when `rail` is `PSE`.
- `inlineCustomer.phone`: `^\+573\d{9}$`.
- `pse` required for `PSE` (`bank`, `personType`); `breb` required for `BRE_B`.
- `callbackUrl`: valid URL when present.
- Unknown properties are rejected (`property X should not exist`).

## `errorCode` values

Treat the list as open; map unknown codes to a generic failure.

**Payins**: `PSE_PAYIN_EXPIRED`, `BRE_B_PAYIN_EXPIRED`, `NEQUI_PAYIN_EXPIRED`,
`PSE_PAYMENT_CANCELLED`, `PSE_PAYIN_VENDOR_REJECTED`, `PSE_LIMIT_EXCEEDED`,
`VENDOR_REJECTED`, `VENDOR_ABORTED`, `PAYIN_DECLINED`, `SANDBOX_DECLINED`,
`SANDBOX_PAYIN_EXPIRED`.

**Payouts**: `BRE_B_KEY_NOT_FOUND`, `BRE_B_DECLINED`, `TRANSFIYA_KEY_NOT_FOUND`,
`TRANSFIYA_DECLINED`, `NEQUI_PAYOUT_REJECTED`, `VENDOR_REJECTED`,
`PAYOUT_DECLINED`, `SANDBOX_DECLINED`.

## Retries

There is no idempotency key and `reference` is not unique. After a timeout or
`5xx` on a create call, search `GET /payins?reference=...` or
`GET /payouts?reference=...` and only create again if nothing exists.
