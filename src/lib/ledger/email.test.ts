import { describe, expect, it, vi } from "vitest";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import { computeDocument } from "./tax";
import {
  canEmailDocument,
  composeDocumentEmail,
  describeEmailSkip,
  documentEmailPath,
  documentPrintPath,
  emailFromFromEnv,
  emailSendConfigured,
  emailSkipReason,
  parseFromAddress,
  parseRecipientEmail,
  parseSendEmail,
  resendApiKeyFromEnv,
  sendDocumentEmail,
  RESEND_EMAILS_URL,
} from "./email";
import { quoteSharePath } from "./share";

const TEST_KEY = "re_test_key";
const TEST_FROM = "Harbourline Inspections <noreply@example.com>";
const Q_0001 = demoSeed.quotes.find((row) => row.docNumber === "Q-0001");
const TOM = demoSeed.customers.find((row) => row.id === DEMO_IDS.customerQuoted);
const JORDAN = demoSeed.customers.find((row) => row.id === DEMO_IDS.customerClaims);

function q0001Totals() {
  if (!Q_0001) {
    throw new Error("missing Q-0001");
  }
  return computeDocument(Q_0001.lines);
}

describe("emailSendConfigured", () => {
  it("treats blank key or from as off", () => {
    expect(resendApiKeyFromEnv({})).toBeUndefined();
    expect(resendApiKeyFromEnv({ RESEND_API_KEY: "  " })).toBeUndefined();
    expect(emailFromFromEnv({})).toBeUndefined();
    expect(emailFromFromEnv({ EMAIL_FROM: "  " })).toBeUndefined();
    expect(emailSendConfigured({})).toBe(false);
    expect(emailSendConfigured({ RESEND_API_KEY: TEST_KEY })).toBe(false);
    expect(emailSendConfigured({ EMAIL_FROM: TEST_FROM })).toBe(false);
    expect(emailSendConfigured({ RESEND_API_KEY: TEST_KEY, EMAIL_FROM: TEST_FROM })).toBe(
      true,
    );
  });
});

describe("parseFromAddress", () => {
  it("rejects empty and junk, keeps a display name", () => {
    expect(parseFromAddress("")).toBeNull();
    expect(parseFromAddress("   ")).toBeNull();
    expect(parseFromAddress("not-an-email")).toBeNull();
    expect(parseFromAddress("Harbourline")).toBeNull();
    expect(parseFromAddress("noreply@example.com")).toBe("noreply@example.com");
    expect(parseFromAddress(TEST_FROM)).toBe(TEST_FROM);
  });
});

describe("parseRecipientEmail", () => {
  it("rejects empty and junk; Tom is a recipient", () => {
    expect(parseRecipientEmail("")).toBeNull();
    expect(parseRecipientEmail("   ")).toBeNull();
    expect(parseRecipientEmail("not-an-email")).toBeNull();
    expect(parseRecipientEmail("tom.nguyen@example.com")).toBe("tom.nguyen@example.com");
    expect(TOM?.email).toBe("tom.nguyen@example.com");
    expect(parseRecipientEmail(TOM?.email)).toBe("tom.nguyen@example.com");
    expect(parseRecipientEmail(JORDAN?.email)).toBeNull();
  });
});

describe("canEmailDocument", () => {
  it("blocks draft and superseded quotes, and void invoices", () => {
    expect(canEmailDocument("quote", "draft")).toBe(false);
    expect(canEmailDocument("quote", "superseded")).toBe(false);
    expect(canEmailDocument("quote", "")).toBe(false);
    expect(canEmailDocument("quote", "sent")).toBe(true);
    expect(canEmailDocument("quote", "accepted")).toBe(true);
    expect(canEmailDocument("quote", "declined")).toBe(true);
    expect(canEmailDocument("invoice", "draft")).toBe(false);
    expect(canEmailDocument("invoice", "void")).toBe(false);
    expect(canEmailDocument("invoice", "sent")).toBe(true);
    expect(canEmailDocument("invoice", "paid")).toBe(true);
  });
});

describe("emailSkipReason", () => {
  it("prefers unset keys, then missing address, then status", () => {
    expect(
      emailSkipReason({
        configured: false,
        to: "tom.nguyen@example.com",
        kind: "quote",
        status: "sent",
      }),
    ).toBe("no_key");
    expect(
      emailSkipReason({
        configured: true,
        to: null,
        kind: "quote",
        status: "sent",
      }),
    ).toBe("no_email");
    expect(
      emailSkipReason({
        configured: true,
        to: "tom.nguyen@example.com",
        kind: "quote",
        status: "draft",
      }),
    ).toBe("not_sendable");
    expect(
      emailSkipReason({
        configured: true,
        to: "tom.nguyen@example.com",
        kind: "quote",
        status: "sent",
      }),
    ).toBeNull();
  });
});

describe("describeEmailSkip", () => {
  it("explains the three skip paths without naming Stripe", () => {
    expect(describeEmailSkip("no_key")).toMatch(/RESEND_API_KEY/);
    expect(describeEmailSkip("no_email")).toMatch(/no email address/);
    expect(describeEmailSkip("not_sendable")).toMatch(/Drafts/);
  });
});

describe("composeDocumentEmail", () => {
  it("pins Q-0001 GST $110.00 / $1,232.00 and the share path", () => {
    if (!Q_0001) {
      throw new Error("missing Q-0001");
    }
    const totals = q0001Totals();
    expect(totals.gstCents).toBe(11000);
    expect(totals.totalCents).toBe(123200);
    const composed = composeDocumentEmail({
      kind: "quote",
      docNumber: Q_0001.docNumber,
      status: Q_0001.status,
      orgName: demoSeed.org.name,
      abn: demoSeed.org.abn,
      gstRegistered: demoSeed.org.gstRegistered,
      gstCents: totals.gstCents,
      totalCents: totals.totalCents,
      origin: "https://og-job-book.vercel.app",
      jobId: Q_0001.jobId,
      documentId: Q_0001.id,
      shareToken: Q_0001.shareToken,
    });
    expect(composed.subject).toBe("Quote Q-0001 from Harbourline Inspections Pty Ltd");
    expect(composed.html).toContain("GST $110.00");
    expect(composed.html).toContain("Total $1,232.00");
    expect(composed.html).toContain("ABN 51 824 753 556");
    expect(composed.html).toContain(
      `https://og-job-book.vercel.app${quoteSharePath(DEMO_IDS.quoteMixedShare)}`,
    );
    expect(composed.html).not.toContain(
      documentPrintPath("quote", Q_0001.jobId, Q_0001.id),
    );
    expect(documentEmailPath({
      kind: "quote",
      jobId: Q_0001.jobId,
      documentId: Q_0001.id,
    })).toBe(documentPrintPath("quote", Q_0001.jobId, Q_0001.id));
    expect(composed.html).toMatch(/not tax advice/i);
    expect(composed.html).not.toMatch(/side gate/i);
    expect(composed.html).not.toMatch(/Stripe/i);
  });
});

describe("parseSendEmail", () => {
  it("rejects empty and junk bodies", () => {
    expect(parseSendEmail(null).ok).toBe(false);
    expect(parseSendEmail(undefined).ok).toBe(false);
    expect(parseSendEmail("")).toEqual(expect.objectContaining({ ok: false }));
    expect(parseSendEmail({}).ok).toBe(false);
    expect(parseSendEmail({ kind: "quote" }).ok).toBe(false);
    expect(parseSendEmail({ kind: "credit", id: DEMO_IDS.quoteMixed }).ok).toBe(false);
    expect(parseSendEmail({ kind: "quote", id: "not-a-uuid" }).ok).toBe(false);
  });

  it("accepts Q-0001", () => {
    expect(parseSendEmail({ kind: "quote", id: DEMO_IDS.quoteMixed })).toEqual({
      ok: true,
      payload: { kind: "quote", id: DEMO_IDS.quoteMixed },
    });
  });
});

describe("sendDocumentEmail", () => {
  it("skips without calling fetch when the key is unset", async () => {
    const fetchImpl = vi.fn();
    const result = await sendDocumentEmail({
      kind: "quote",
      status: "sent",
      docNumber: "Q-0001",
      orgName: demoSeed.org.name,
      abn: demoSeed.org.abn,
      gstRegistered: true,
      gstCents: 11000,
      totalCents: 123200,
      jobId: DEMO_IDS.jobQuoted,
      documentId: DEMO_IDS.quoteMixed,
      to: "tom.nguyen@example.com",
      origin: "http://127.0.0.1:3000",
      apiKey: "",
      from: TEST_FROM,
      fetchImpl,
    });
    expect(result).toEqual({ status: "skipped", reason: "no_key" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not POST a draft quote", async () => {
    const fetchImpl = vi.fn();
    const result = await sendDocumentEmail({
      kind: "quote",
      status: "draft",
      docNumber: "Q-0003",
      orgName: demoSeed.org.name,
      abn: demoSeed.org.abn,
      gstRegistered: true,
      gstCents: 0,
      totalCents: 0,
      jobId: DEMO_IDS.jobEnquiry,
      documentId: DEMO_IDS.quoteDraft,
      to: "tom.nguyen@example.com",
      origin: "",
      apiKey: TEST_KEY,
      from: TEST_FROM,
      fetchImpl,
    });
    expect(result).toEqual({ status: "skipped", reason: "not_sendable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts Q-0001 GST totals to Resend and keeps the key out of errors", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(RESEND_EMAILS_URL);
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${TEST_KEY}`);
      const body = JSON.parse(String(init?.body)) as {
        from: string;
        to: string[];
        subject: string;
        html: string;
      };
      expect(body.from).toBe(TEST_FROM);
      expect(body.to).toEqual(["tom.nguyen@example.com"]);
      expect(body.html).toContain("GST $110.00");
      expect(body.html).toContain("Total $1,232.00");
      return new Response(JSON.stringify({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }), {
        status: 200,
      });
    });
    const result = await sendDocumentEmail({
      kind: "quote",
      status: "sent",
      docNumber: "Q-0001",
      orgName: demoSeed.org.name,
      abn: demoSeed.org.abn,
      gstRegistered: true,
      gstCents: 11000,
      totalCents: 123200,
      jobId: DEMO_IDS.jobQuoted,
      documentId: DEMO_IDS.quoteMixed,
      to: "tom.nguyen@example.com",
      origin: "https://og-job-book.vercel.app",
      apiKey: TEST_KEY,
      from: TEST_FROM,
      fetchImpl,
    });
    expect(result).toEqual({ status: "sent", id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps HTTP 401 without echoing the API key", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "API key is invalid" }), { status: 401 }),
    );
    const result = await sendDocumentEmail({
      kind: "invoice",
      status: "paid",
      docNumber: "INV-0001",
      orgName: demoSeed.org.name,
      abn: demoSeed.org.abn,
      gstRegistered: true,
      gstCents: 4000,
      totalCents: 44000,
      jobId: DEMO_IDS.jobPaid,
      documentId: DEMO_IDS.invoice,
      to: "priya.shah@example.com",
      origin: "",
      apiKey: TEST_KEY,
      from: TEST_FROM,
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

  it("rejects a Resend body with no id", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const result = await sendDocumentEmail({
      kind: "quote",
      status: "sent",
      docNumber: "Q-0001",
      orgName: demoSeed.org.name,
      abn: demoSeed.org.abn,
      gstRegistered: true,
      gstCents: 11000,
      totalCents: 123200,
      jobId: DEMO_IDS.jobQuoted,
      documentId: DEMO_IDS.quoteMixed,
      to: "tom.nguyen@example.com",
      origin: "",
      apiKey: TEST_KEY,
      from: TEST_FROM,
      fetchImpl,
    });
    expect(result).toEqual({
      status: "error",
      reason: "parse",
      message: "Resend did not return an id",
    });
  });
});
