import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import { computeDocument } from "./tax";
import {
  canChargeInvoice,
  createCheckoutSession,
  describeStripeSkip,
  dueNowCents,
  parseCheckoutOrigin,
  parseStripeCheckout,
  parseStripeCheckoutCompleted,
  parseStripeSignatureHeader,
  stripeChargeConfigured,
  stripeCheckoutFormBody,
  stripeSecretKeyFromEnv,
  stripeSkipReason,
  stripeWebhookApplyReason,
  stripeWebhookSecretFromEnv,
  verifyStripeSignature,
  STRIPE_CHECKOUT_URL,
} from "./stripe";

const TEST_KEY = "sk_test_jobbook";
const TEST_WEBHOOK = "whsec_test_jobbook";
const INV_0002 = demoSeed.invoices.find((row) => row.id === DEMO_IDS.invoiceUnpaid);
const INV_0004 = demoSeed.invoices.find((row) => row.id === DEMO_IDS.invoiceVariation);
const CN_0001 = demoSeed.creditNotes.find((note) => note.invoiceId === DEMO_IDS.invoiceUnpaid);

function inv0002DueNow() {
  if (!INV_0002 || !CN_0001) {
    throw new Error("missing INV-0002");
  }
  return dueNowCents({
    totalCents: computeDocument(INV_0002.lines).totalCents,
    paidCents: 0,
    creditedCents: computeDocument(CN_0001.lines).totalCents,
    retentionHeldCents: INV_0002.retentionHeldCents,
  });
}

function inv0004DueNow() {
  if (!INV_0004) {
    throw new Error("missing INV-0004");
  }
  return dueNowCents({
    totalCents: computeDocument(INV_0004.lines).totalCents,
    paidCents: 0,
    creditedCents: 0,
    retentionHeldCents: INV_0004.retentionHeldCents,
  });
}

function signedHeader(payload: string, secret: string, timestamp: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

describe("stripeChargeConfigured", () => {
  it("treats blank secret or webhook secret as off", () => {
    expect(stripeSecretKeyFromEnv({})).toBeUndefined();
    expect(stripeSecretKeyFromEnv({ STRIPE_SECRET_KEY: "  " })).toBeUndefined();
    expect(stripeWebhookSecretFromEnv({})).toBeUndefined();
    expect(stripeWebhookSecretFromEnv({ STRIPE_WEBHOOK_SECRET: "  " })).toBeUndefined();
    expect(stripeChargeConfigured({})).toBe(false);
    expect(stripeChargeConfigured({ STRIPE_SECRET_KEY: TEST_KEY })).toBe(false);
    expect(stripeChargeConfigured({ STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK })).toBe(false);
    expect(
      stripeChargeConfigured({
        STRIPE_SECRET_KEY: TEST_KEY,
        STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK,
      }),
    ).toBe(true);
  });
});

describe("parseCheckoutOrigin", () => {
  it("rejects empty and junk, keeps http and https without a trailing slash", () => {
    expect(parseCheckoutOrigin("")).toBeNull();
    expect(parseCheckoutOrigin("   ")).toBeNull();
    expect(parseCheckoutOrigin("not-a-url")).toBeNull();
    expect(parseCheckoutOrigin("ftp://example.com")).toBeNull();
    expect(parseCheckoutOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(parseCheckoutOrigin("https://og-job-book.vercel.app/")).toBe(
      "https://og-job-book.vercel.app",
    );
  });
});

describe("parseStripeCheckout", () => {
  it("rejects empty and junk bodies", () => {
    expect(parseStripeCheckout(null).ok).toBe(false);
    expect(parseStripeCheckout(undefined).ok).toBe(false);
    expect(parseStripeCheckout("").ok).toBe(false);
    expect(parseStripeCheckout({}).ok).toBe(false);
    expect(parseStripeCheckout({ invoiceId: "" }).ok).toBe(false);
    expect(parseStripeCheckout({ invoiceId: "not-a-uuid" }).ok).toBe(false);
  });

  it("accepts INV-0002 and strips extra keys", () => {
    const parsed = parseStripeCheckout({
      invoiceId: DEMO_IDS.invoiceUnpaid,
      extra: true,
    });
    expect(parsed).toEqual({
      ok: true,
      payload: { invoiceId: DEMO_IDS.invoiceUnpaid },
    });
  });
});

describe("dueNowCents and canChargeInvoice", () => {
  it("pins INV-0002 $440 due now after CN-0001, not the $550 total", () => {
    expect(inv0002DueNow()).toBe(44000);
    expect(INV_0002?.lines[0]?.unitPriceCents).toBe(55000);
    expect(canChargeInvoice("sent", 44000)).toBe(true);
    expect(canChargeInvoice("void", 44000)).toBe(false);
    expect(canChargeInvoice("draft", 44000)).toBe(false);
    expect(canChargeInvoice("", 44000)).toBe(false);
    expect(canChargeInvoice("sent", 0)).toBe(false);
    expect(canChargeInvoice("paid", 0)).toBe(false);
  });

  it("pins INV-0004 $313.50 due now after retention held", () => {
    expect(inv0004DueNow()).toBe(31350);
    expect(INV_0004?.retentionHeldCents).toBe(1650);
    expect(canChargeInvoice("sent", 31350)).toBe(true);
  });
});

describe("stripeSkipReason", () => {
  it("orders no_key, no_origin, not_payable, then already_paid", () => {
    expect(
      stripeSkipReason({
        configured: false,
        origin: "http://127.0.0.1:3000",
        status: "sent",
        remainingCents: 44000,
      }),
    ).toBe("no_key");
    expect(
      stripeSkipReason({
        configured: true,
        origin: null,
        status: "sent",
        remainingCents: 44000,
      }),
    ).toBe("no_origin");
    expect(
      stripeSkipReason({
        configured: true,
        origin: "http://127.0.0.1:3000",
        status: "void",
        remainingCents: 44000,
      }),
    ).toBe("not_payable");
    expect(
      stripeSkipReason({
        configured: true,
        origin: "http://127.0.0.1:3000",
        status: "sent",
        remainingCents: 0,
      }),
    ).toBe("already_paid");
    expect(
      stripeSkipReason({
        configured: true,
        origin: "http://127.0.0.1:3000",
        status: "sent",
        remainingCents: 44000,
      }),
    ).toBeNull();
  });

  it("explains the skip paths without Confirmation of Payee", () => {
    expect(describeStripeSkip("no_key")).toMatch(/not available/i);
    expect(describeStripeSkip("no_key")).not.toMatch(/Confirmation of Payee/i);
    expect(describeStripeSkip("already_paid")).toMatch(/amount due now/i);
  });
});

describe("stripeCheckoutFormBody", () => {
  it("charges INV-0002 $440.00 AUD due now, not the $550 total", () => {
    const body = stripeCheckoutFormBody({
      invoiceId: DEMO_IDS.invoiceUnpaid,
      jobId: DEMO_IDS.jobInvoiced,
      docNumber: "INV-0002",
      amountCents: inv0002DueNow(),
      successUrl: "http://127.0.0.1:3000/jobs/job?card=1",
      cancelUrl: "http://127.0.0.1:3000/jobs/job",
      customerEmail: "alex.moretti@example.com",
    });
    const params = new URLSearchParams(body);
    expect(params.get("mode")).toBe("payment");
    expect(params.get("line_items[0][price_data][currency]")).toBe("aud");
    expect(params.get("line_items[0][price_data][unit_amount]")).toBe("44000");
    expect(params.get("line_items[0][price_data][product_data][name]")).toContain("$440.00");
    expect(params.get("line_items[0][price_data][product_data][name]")).not.toContain("$550.00");
    expect(params.get("client_reference_id")).toBe(DEMO_IDS.invoiceUnpaid);
    expect(params.get("customer_email")).toBe("alex.moretti@example.com");
  });
});

describe("createCheckoutSession", () => {
  it("skips without calling fetch when the key is unset", async () => {
    const fetchImpl = vi.fn();
    const result = await createCheckoutSession({
      invoiceId: DEMO_IDS.invoiceUnpaid,
      jobId: DEMO_IDS.jobInvoiced,
      docNumber: "INV-0002",
      status: "sent",
      remainingCents: 44000,
      origin: "http://127.0.0.1:3000",
      apiKey: "",
      webhookSecret: TEST_WEBHOOK,
      fetchImpl,
    });
    expect(result).toEqual({ status: "skipped", reason: "no_key" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not POST a void invoice or a zero remaining", async () => {
    const fetchImpl = vi.fn();
    expect(
      await createCheckoutSession({
        invoiceId: DEMO_IDS.invoiceUnpaid,
        jobId: DEMO_IDS.jobInvoiced,
        docNumber: "INV-0002",
        status: "void",
        remainingCents: 44000,
        origin: "http://127.0.0.1:3000",
        apiKey: TEST_KEY,
        webhookSecret: TEST_WEBHOOK,
        fetchImpl,
      }),
    ).toEqual({ status: "skipped", reason: "not_payable" });
    expect(
      await createCheckoutSession({
        invoiceId: DEMO_IDS.invoice,
        jobId: DEMO_IDS.jobPaid,
        docNumber: "INV-0001",
        status: "paid",
        remainingCents: 0,
        origin: "http://127.0.0.1:3000",
        apiKey: TEST_KEY,
        webhookSecret: TEST_WEBHOOK,
        fetchImpl,
      }),
    ).toEqual({ status: "skipped", reason: "already_paid" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts INV-0002 due-now cents and keeps the key out of errors", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(STRIPE_CHECKOUT_URL);
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${TEST_KEY}`);
      expect(headers.get("Content-Type")).toBe("application/x-www-form-urlencoded");
      const params = new URLSearchParams(String(init?.body));
      expect(params.get("line_items[0][price_data][unit_amount]")).toBe("44000");
      expect(params.get("line_items[0][price_data][currency]")).toBe("aud");
      return new Response(
        JSON.stringify({
          id: "cs_test_inv0002",
          url: "https://checkout.stripe.com/c/pay/cs_test_inv0002",
        }),
        { status: 200 },
      );
    });
    const result = await createCheckoutSession({
      invoiceId: DEMO_IDS.invoiceUnpaid,
      jobId: DEMO_IDS.jobInvoiced,
      docNumber: "INV-0002",
      status: "sent",
      remainingCents: inv0002DueNow(),
      origin: "https://og-job-book.vercel.app",
      customerEmail: "alex.moretti@example.com",
      apiKey: TEST_KEY,
      webhookSecret: TEST_WEBHOOK,
      fetchImpl,
    });
    expect(result).toEqual({
      status: "created",
      id: "cs_test_inv0002",
      url: "https://checkout.stripe.com/c/pay/cs_test_inv0002",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps HTTP 401 without echoing the secret key", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "Invalid API Key provided" } }), {
          status: 401,
        }),
    );
    const result = await createCheckoutSession({
      invoiceId: DEMO_IDS.invoiceUnpaid,
      jobId: DEMO_IDS.jobInvoiced,
      docNumber: "INV-0002",
      status: "sent",
      remainingCents: 44000,
      origin: "http://127.0.0.1:3000",
      apiKey: TEST_KEY,
      webhookSecret: TEST_WEBHOOK,
      fetchImpl,
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") {
      throw new Error("expected error");
    }
    expect(result.reason).toBe("http");
    expect(result.message).toContain("401");
    expect(result.message).not.toContain(TEST_KEY);
  });

  it("rejects a Stripe body with no https url", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "cs_test" }), { status: 200 }));
    const result = await createCheckoutSession({
      invoiceId: DEMO_IDS.invoiceUnpaid,
      jobId: DEMO_IDS.jobInvoiced,
      docNumber: "INV-0002",
      status: "sent",
      remainingCents: 44000,
      origin: "http://127.0.0.1:3000",
      apiKey: TEST_KEY,
      webhookSecret: TEST_WEBHOOK,
      fetchImpl,
    });
    expect(result).toEqual({
      status: "error",
      reason: "parse",
      message: "Stripe did not return a Checkout url",
    });
  });
});

describe("verifyStripeSignature", () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const now = 1_778_000_000;

  it("rejects empty and junk headers", () => {
    expect(parseStripeSignatureHeader("")).toBeNull();
    expect(parseStripeSignatureHeader("not-a-signature")).toBeNull();
    expect(
      verifyStripeSignature({ payload, header: "", secret: TEST_WEBHOOK, nowSeconds: now }),
    ).toBe(false);
    expect(
      verifyStripeSignature({ payload: "", header: signedHeader(payload, TEST_WEBHOOK, now), secret: TEST_WEBHOOK, nowSeconds: now }),
    ).toBe(false);
    expect(
      verifyStripeSignature({
        payload,
        header: signedHeader(payload, TEST_WEBHOOK, now),
        secret: "",
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it("accepts a matching v1 HMAC and rejects a wrong secret, payload, or old timestamp", () => {
    const header = signedHeader(payload, TEST_WEBHOOK, now);
    expect(
      verifyStripeSignature({ payload, header, secret: TEST_WEBHOOK, nowSeconds: now }),
    ).toBe(true);
    expect(
      verifyStripeSignature({
        payload,
        header,
        secret: "whsec_other",
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      verifyStripeSignature({
        payload: `${payload} `,
        header,
        secret: TEST_WEBHOOK,
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      verifyStripeSignature({
        payload,
        header,
        secret: TEST_WEBHOOK,
        nowSeconds: now + 301,
      }),
    ).toBe(false);
  });
});

describe("parseStripeCheckoutCompleted", () => {
  it("rejects empty and junk events", () => {
    expect(parseStripeCheckoutCompleted(null)).toEqual({ ok: false, reason: "junk" });
    expect(parseStripeCheckoutCompleted({})).toEqual({ ok: false, reason: "junk" });
    expect(parseStripeCheckoutCompleted({ type: "" })).toEqual({ ok: false, reason: "junk" });
  });

  it("ignores other event types and unpaid sessions", () => {
    expect(parseStripeCheckoutCompleted({ type: "ping" })).toEqual({
      ok: false,
      reason: "ignored",
    });
    expect(
      parseStripeCheckoutCompleted({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_unpaid",
            amount_total: 44000,
            currency: "aud",
            payment_status: "unpaid",
            client_reference_id: DEMO_IDS.invoiceUnpaid,
          },
        },
      }),
    ).toEqual({ ok: false, reason: "ignored" });
  });

  it("reads INV-0002 $440 from a completed AUD session", () => {
    expect(
      parseStripeCheckoutCompleted({
        type: "checkout.session.completed",
        extra: true,
        data: {
          object: {
            id: "cs_test_inv0002",
            amount_total: 44000,
            currency: "aud",
            payment_status: "paid",
            client_reference_id: DEMO_IDS.invoiceUnpaid,
            metadata: { invoiceId: DEMO_IDS.invoiceUnpaid },
          },
        },
      }),
    ).toEqual({
      ok: true,
      sessionId: "cs_test_inv0002",
      invoiceId: DEMO_IDS.invoiceUnpaid,
      amountCents: 44000,
    });
  });

  it("rejects a zero amount, a non-AUD currency, and a junk invoice id", () => {
    const base = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_inv0002",
          amount_total: 44000,
          currency: "aud",
          payment_status: "paid",
          client_reference_id: DEMO_IDS.invoiceUnpaid,
        },
      },
    };
    expect(
      parseStripeCheckoutCompleted({
        ...base,
        data: { object: { ...base.data.object, amount_total: 0 } },
      }),
    ).toEqual({ ok: false, reason: "junk" });
    expect(
      parseStripeCheckoutCompleted({
        ...base,
        data: { object: { ...base.data.object, currency: "usd" } },
      }),
    ).toEqual({ ok: false, reason: "junk" });
    expect(
      parseStripeCheckoutCompleted({
        ...base,
        data: { object: { ...base.data.object, client_reference_id: "nope" } },
      }),
    ).toEqual({ ok: false, reason: "junk" });
  });
});

describe("stripeWebhookApplyReason", () => {
  it("skips missing, void, draft, and already-paid remaining", () => {
    expect(stripeWebhookApplyReason({ invoice: null, remainingCents: 44000 })).toBe("missing");
    expect(stripeWebhookApplyReason({ invoice: { status: "void" }, remainingCents: 44000 })).toBe(
      "void",
    );
    expect(stripeWebhookApplyReason({ invoice: { status: "draft" }, remainingCents: 44000 })).toBe(
      "not_payable",
    );
    expect(stripeWebhookApplyReason({ invoice: { status: "sent" }, remainingCents: 0 })).toBe(
      "already_paid",
    );
    expect(stripeWebhookApplyReason({ invoice: { status: "sent" }, remainingCents: 44000 })).toBe(
      "ok",
    );
  });
});
