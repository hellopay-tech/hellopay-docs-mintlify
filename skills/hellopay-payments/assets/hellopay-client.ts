/**
 * Minimal HelloPay API client — dependency-free (native fetch, Node 18+ / browsers).
 *
 * Usage:
 *   const hp = new HelloPay({ apiKey: process.env.HELLOPAY_API_KEY!, env: "sandbox" });
 *   const payin = await hp.createPayin({ ... });
 *   const settled = await hp.pollPayin(payin.id, (p) => p.status !== "PROCESSING");
 *
 * Call this from your backend only — never expose the API key client-side.
 */

export type Environment = "sandbox" | "production";

const BASE_URLS: Record<Environment, string> = {
  sandbox: "https://api.stg.hellopay.com.co",
  production: "https://api.hellopay.com.co",
};

export type IdType = "CO_CC" | "CO_CE" | "CO_NIT" | "MXN_RFC" | "PASSPORT";
export type PayinRail = "PSE" | "BRE_B";
export type PayoutRail = "BRE_B" | "TRANSFIYA";
export type TxStatus = "PENDING" | "PROCESSING" | "CONFIRMED" | "DECLINED" | "CANCELED";

export interface InlineCustomer {
  name: string;
  idType: IdType;
  idNumber: string;
  phone: string;
  email: string;
}

export interface CreatePayinInput {
  amountInCents: number;
  currency: "COP";
  rail: PayinRail;
  reference: string;
  inlineCustomer: InlineCustomer;
  /** Required when rail === "PSE". */
  pse?: { bank: string; personType: "INDIVIDUAL" | "BUSINESS" };
  /** Required when rail === "BRE_B". */
  breb?: { keyType: "SINGLE_USE" | "QR_CODE" };
  callbackUrl?: string;
}

export interface CreatePayoutInput {
  amountInCents: number;
  currency: "COP";
  rail: PayoutRail;
  reference: string;
  inlineCustomer?: InlineCustomer;
  /** Required when rail === "BRE_B". */
  breb?: { keyString: string };
  /** Required when rail === "TRANSFIYA". */
  transfiya?: {
    keyString: string;
    account: { bank: string; bankAccountNumber: string; customerDocumentNumber: string };
  };
}

export interface CreatePaymentLinkInput {
  amountType: "FIXED";
  amountInCents: number;
  reference: string;
  callbackUrl: string;
  /** Omit to allow all enabled methods; set to restrict to one rail. */
  rail?: PayinRail;
  inlineCustomer?: InlineCustomer;
  /** Only when rail === "PSE". */
  pse?: { bank: string };
}

export interface Transaction {
  id: string;
  status: TxStatus;
  rail: string;
  reference: string;
  amount: number;
  amountInCents: number;
  currency: string;
  sourceData?: Record<string, unknown>;
  targetData?: Record<string, unknown>;
  errorCode?: string | null;
  [key: string]: unknown;
}

export interface PaymentLink {
  paymentLinkId: string;
  paymentLinkUrl: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  [key: string]: unknown;
}

export class HelloPayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "HelloPayError";
  }
}

export class HelloPay {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: { apiKey: string; env?: Environment; baseUrl?: string }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? BASE_URLS[opts.env ?? "sandbox"];
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "x-api-key": this.apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new HelloPayError(`HelloPay ${method} ${path} failed (${res.status})`, res.status, data);
    }
    return data as T;
  }

  // ---- Payins ----
  createPayin(input: CreatePayinInput) {
    return this.request<Transaction>("POST", "/payins", input);
  }
  getPayin(id: string) {
    return this.request<Transaction>("GET", `/payins/${id}`);
  }

  // ---- Payouts ----
  createPayout(input: CreatePayoutInput) {
    return this.request<Transaction>("POST", "/payouts", input);
  }
  getPayout(id: string) {
    return this.request<Transaction>("GET", `/payouts/${id}`);
  }

  // ---- Payment links ----
  createPaymentLink(input: CreatePaymentLinkInput) {
    return this.request<PaymentLink>("POST", "/payment-links", input);
  }
  getPaymentLink(paymentLinkId: string) {
    return this.request<PaymentLink>("GET", `/payment-links/${paymentLinkId}`);
  }

  // ---- BRE-B ----
  getBrebKey(keyString: string) {
    return this.request<{ details: Record<string, unknown> }>(
      "GET",
      `/breb/keys/${encodeURIComponent(keyString)}`,
    );
  }

  // ---- Ledger ----
  getBalance() {
    return this.request<unknown[]>("GET", "/ledger/balance");
  }

  /**
   * Poll a payin until `done(tx)` returns true (e.g. status leaves PROCESSING, or
   * sourceData.pseUrl is populated). Throws on timeout.
   */
  async pollPayin(
    id: string,
    done: (tx: Transaction) => boolean,
    { intervalMs = 2000, timeoutMs = 60000 }: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<Transaction> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const tx = await this.getPayin(id);
      if (done(tx)) return tx;
      if (Date.now() >= deadline) {
        throw new HelloPayError(`Timed out polling payin ${id}`, 408, tx);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

/* ---------------------------------------------------------------------------
 * Example: create a PSE payin and wait for the redirect URL.
 *
 * const hp = new HelloPay({ apiKey: process.env.HELLOPAY_API_KEY!, env: "sandbox" });
 * const payin = await hp.createPayin({
 *   amountInCents: 10000,
 *   currency: "COP",
 *   rail: "PSE",
 *   reference: "INV-2024-001",
 *   inlineCustomer: {
 *     name: "John Doe", idType: "CO_CC", idNumber: "1000000001",
 *     email: "john.doe@example.com", phone: "+573001234567",
 *   },
 *   pse: { bank: "CO_BANCOLOMBIA", personType: "INDIVIDUAL" },
 *   callbackUrl: "https://your-app.com/checkout/return",
 * });
 *
 * const ready = await hp.pollPayin(payin.id, (p) => Boolean(p.sourceData?.pseUrl));
 * redirect(ready.sourceData!.pseUrl as string);
 * // Final outcome arrives via the payin.confirmed / payin.declined webhook.
 * ------------------------------------------------------------------------- */
