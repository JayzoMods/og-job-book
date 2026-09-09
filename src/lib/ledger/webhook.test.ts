import { describe, expect, it } from "vitest";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import { computeDocument } from "./tax";
import {
  parsePaymentWebhook,
  webhookApplyReason,
  webhookPaymentOutcome,
  webhookRejectStatus,
} from "./webhook";

const INV_0002_ID = DEMO_IDS.invoiceUnpaid;

function unpaidDemoInvoice() {
  const invoice = demoSeed.invoices.find((row) => row.id === INV_0002_ID);
  const credit = demoSeed.creditNotes.find((note) => note.invoiceId === INV_0002_ID);
  if (!invoice || !credit) {
    throw new Error("missing INV-0002");
  }
  return {
    invoice,
    totals: computeDocument(invoice.lines),
    creditedCents: computeDocument(credit.lines).totalCents,
  };
}

describe("parsePaymentWebhook", () => {
  it("rejects empty and junk bodies", () => {
    expect(parsePaymentWebhook(null).ok).toBe(false);
    expect(parsePaymentWebhook(undefined).ok).toBe(false);
    expect(parsePaymentWebhook("").ok).toBe(false);
    expect(parsePaymentWebhook({}).ok).toBe(false);
    expect(parsePaymentWebhook({ invoiceId: INV_0002_ID }).ok).toBe(false);
  });

  it("rejects a non-uuid, a zero amount, a float, a bad date, and a junk method", () => {
    const base = {
      invoiceId: INV_0002_ID,
      amountCents: 44000,
      paidOn: "2026-09-09",
      method: "transfer",
    };
    expect(parsePaymentWebhook({ ...base, invoiceId: "" }).ok).toBe(false);
    expect(parsePaymentWebhook({ ...base, invoiceId: "not-a-uuid" }).ok).toBe(false);
    expect(parsePaymentWebhook({ ...base, amountCents: 0 }).ok).toBe(false);
    expect(parsePaymentWebhook({ ...base, amountCents: -1 }).ok).toBe(false);
    expect(parsePaymentWebhook({ ...base, amountCents: 1.5 }).ok).toBe(false);
    expect(parsePaymentWebhook({ ...base, amountCents: "44000" }).ok).toBe(false);
    expect(parsePaymentWebhook({ ...base, paidOn: "" }).ok).toBe(false);
    expect(parsePaymentWebhook({ ...base, paidOn: "09/09/2026" }).ok).toBe(false);
    expect(parsePaymentWebhook({ ...base, method: "stripe" }).ok).toBe(false);
    expect(parsePaymentWebhook({ ...base, method: "" }).ok).toBe(false);
  });

  it("accepts the demo INV-0002 remaining as a transfer", () => {
    const parsed = parsePaymentWebhook({
      invoiceId: INV_0002_ID,
      amountCents: 44000,
      paidOn: "2026-09-09",
      method: "transfer",
    });
    expect(parsed).toEqual({
      ok: true,
      payload: {
        invoiceId: INV_0002_ID,
        amountCents: 44000,
        paidOn: "2026-09-09",
        method: "transfer",
      },
    });
  });
});

describe("webhookApplyReason", () => {
  it("rejects a missing invoice and a void invoice", () => {
    expect(webhookApplyReason(null)).toBe("missing");
    expect(webhookApplyReason(undefined)).toBe("missing");
    expect(webhookApplyReason({ status: "void" })).toBe("void");
    expect(webhookRejectStatus("missing")).toBe(404);
    expect(webhookRejectStatus("void")).toBe(409);
  });

  it("allows sent, paid, and draft the same way the record-payment form does", () => {
    expect(webhookApplyReason({ status: "sent" })).toBe("ok");
    expect(webhookApplyReason({ status: "paid" })).toBe("ok");
    expect(webhookApplyReason({ status: "draft" })).toBe("ok");
  });
});

describe("webhookPaymentOutcome", () => {
  it("pins INV-0002: $440 remaining after CN-0001, then paid", () => {
    const { invoice, totals, creditedCents } = unpaidDemoInvoice();
    const before = {
      totalCents: totals.totalCents,
      paidCents: 0,
      creditedCents,
      retentionHeldCents: invoice.retentionHeldCents,
    };
    expect(creditedCents).toBe(11000);
    expect(webhookPaymentOutcome(before, 10000)).toEqual({
      remainingCents: 34000,
      markPaid: false,
    });
    expect(webhookPaymentOutcome(before, 44000)).toEqual({
      remainingCents: 0,
      markPaid: true,
    });
  });

  it("counts retention held on INV-0004 so due-now can hit zero", () => {
    const invoice = demoSeed.invoices.find((row) => row.id === DEMO_IDS.invoiceVariation);
    if (!invoice) {
      throw new Error("missing INV-0004");
    }
    const totals = computeDocument(invoice.lines);
    expect(
      webhookPaymentOutcome(
        {
          totalCents: totals.totalCents,
          paidCents: 0,
          creditedCents: 0,
          retentionHeldCents: invoice.retentionHeldCents,
        },
        31350,
      ),
    ).toEqual({ remainingCents: 0, markPaid: true });
  });
});
