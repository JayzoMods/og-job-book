import { describe, expect, it } from "vitest";
import {
  claimedCentsFromInvoices,
  claimExceedsRemaining,
  claimLineDescription,
  claimTaxCode,
  invoiceKindSubtitle,
  invoicePanelTitle,
  netRetentionHeldCents,
  nextJobStatusFromInvoices,
  parseClaimPercent,
  parseInvoiceKind,
  parseRetentionPercent,
  percentOfCents,
  remainingContractCents,
  retentionHeldCents,
} from "./claim";

describe("parseInvoiceKind", () => {
  it("treats empty and junk as standard", () => {
    expect(parseInvoiceKind("")).toBe("standard");
    expect(parseInvoiceKind("   ")).toBe("standard");
    expect(parseInvoiceKind(null)).toBe("standard");
    expect(parseInvoiceKind("refund")).toBe("standard");
  });

  it("accepts the six invoice kinds", () => {
    expect(parseInvoiceKind("deposit")).toBe("deposit");
    expect(parseInvoiceKind("PROGRESS")).toBe("progress");
    expect(parseInvoiceKind("variation")).toBe("variation");
    expect(parseInvoiceKind("retention")).toBe("retention");
    expect(parseInvoiceKind("recurring")).toBe("recurring");
  });
});

describe("parseClaimPercent", () => {
  it("rejects empty, zero, decimals, and over 100", () => {
    expect(parseClaimPercent("")).toBeNull();
    expect(parseClaimPercent("   ")).toBeNull();
    expect(parseClaimPercent(null)).toBeNull();
    expect(parseClaimPercent("0")).toBeNull();
    expect(parseClaimPercent(0)).toBeNull();
    expect(parseClaimPercent("20.5")).toBeNull();
    expect(parseClaimPercent("101")).toBeNull();
    expect(parseClaimPercent("-5")).toBeNull();
  });

  it("accepts whole percents from 1 to 100", () => {
    expect(parseClaimPercent("1")).toBe(1);
    expect(parseClaimPercent("20")).toBe(20);
    expect(parseClaimPercent(100)).toBe(100);
  });
});

describe("parseRetentionPercent", () => {
  it("falls back to 0 so unknown values do not hold money", () => {
    expect(parseRetentionPercent("")).toBe(0);
    expect(parseRetentionPercent("3")).toBe(0);
    expect(parseRetentionPercent(-5)).toBe(0);
    expect(parseRetentionPercent("100")).toBe(0);
  });

  it("allows 0, 5, and 10", () => {
    expect(parseRetentionPercent(0)).toBe(0);
    expect(parseRetentionPercent("5")).toBe(5);
    expect(parseRetentionPercent(10)).toBe(10);
  });
});

describe("percentOfCents and remaining", () => {
  it("pins 20% of the $2,200 demo quote", () => {
    expect(percentOfCents(220000, 20)).toBe(44000);
    expect(remainingContractCents(220000, 44000)).toBe(176000);
  });

  it("allows a claim equal to remaining and rejects over", () => {
    expect(claimExceedsRemaining(176000, 176000)).toBe(false);
    expect(claimExceedsRemaining(176001, 176000)).toBe(true);
  });

  it("returns 0 for empty or zero totals", () => {
    expect(percentOfCents(0, 20)).toBe(0);
    expect(percentOfCents(-100, 20)).toBe(0);
    expect(remainingContractCents(220000, 990000)).toBe(0);
  });

  it("rounds 1% of $0.50 to 1 cent and 1% of $0.01 to 0", () => {
    expect(percentOfCents(50, 1)).toBe(1);
    expect(percentOfCents(1, 1)).toBe(0);
  });
});

describe("retentionHeldCents", () => {
  it("holds 5% of the $440 deposit", () => {
    expect(retentionHeldCents(44000, 5)).toBe(2200);
    expect(retentionHeldCents(44000, 0)).toBe(0);
    expect(retentionHeldCents(33000, 5)).toBe(1650);
  });
});

describe("claimedCentsFromInvoices", () => {
  it("sums live deposit and progress and ignores void, variation, retention, and recurring", () => {
    const invoices = [
      { quoteId: "q1", status: "paid", kind: "deposit", totalCents: 44000 },
      { quoteId: "q1", status: "void", kind: "progress", totalCents: 88000 },
      { quoteId: "q1", status: "sent", kind: "variation", totalCents: 33000 },
      { quoteId: "q1", status: "sent", kind: "retention", totalCents: 2200 },
      { quoteId: "q1", status: "sent", kind: "recurring", totalCents: 44000 },
      { quoteId: "q2", status: "sent", kind: "deposit", totalCents: 10000 },
    ];
    expect(claimedCentsFromInvoices(invoices, "q1")).toBe(44000);
  });
});

describe("netRetentionHeldCents", () => {
  it("holds stamped retention minus live releases, and ignores void", () => {
    const invoices = [
      {
        quoteId: "q1",
        status: "paid",
        kind: "deposit",
        retentionHeldCents: 2200,
        totalCents: 44000,
      },
      {
        quoteId: "q1",
        status: "sent",
        kind: "variation",
        retentionHeldCents: 1650,
        totalCents: 33000,
      },
      {
        quoteId: "q1",
        status: "void",
        kind: "retention",
        retentionHeldCents: 0,
        totalCents: 2200,
      },
    ];
    expect(netRetentionHeldCents(invoices, "q1")).toBe(3850);
    expect(
      netRetentionHeldCents(
        [
          ...invoices,
          {
            quoteId: "q1",
            status: "sent",
            kind: "retention",
            retentionHeldCents: 0,
            totalCents: 2200,
          },
        ],
        "q1",
      ),
    ).toBe(1650);
  });
});

describe("nextJobStatusFromInvoices", () => {
  it("is accepted with no live invoices, invoiced while any are unpaid, paid only when all live are paid", () => {
    expect(nextJobStatusFromInvoices([])).toBe("accepted");
    expect(nextJobStatusFromInvoices([{ status: "void" }])).toBe("accepted");
    expect(
      nextJobStatusFromInvoices([{ status: "paid" }, { status: "sent" }]),
    ).toBe("invoiced");
    expect(
      nextJobStatusFromInvoices([{ status: "paid" }, { status: "void" }]),
    ).toBe("paid");
    expect(nextJobStatusFromInvoices([{ status: "sent" }])).toBe("invoiced");
  });
});

describe("claimTaxCode", () => {
  it("uses GST if any GST line exists, otherwise GST-free, otherwise GST", () => {
    expect(claimTaxCode(["GST", "GST_FREE"])).toBe("GST");
    expect(claimTaxCode(["GST_FREE"])).toBe("GST_FREE");
    expect(claimTaxCode([])).toBe("GST");
  });
});

describe("claim copy", () => {
  it("labels deposit, remainder, and retention against the quote number", () => {
    expect(
      claimLineDescription({
        kind: "deposit",
        quoteDocNumber: "Q-0005",
        percent: 20,
        remainder: false,
      }),
    ).toBe("Deposit 20% of Q-0005");
    expect(
      claimLineDescription({
        kind: "progress",
        quoteDocNumber: "Q-0005",
        percent: null,
        remainder: true,
      }),
    ).toBe("Progress claim — remainder of Q-0005");
    expect(
      invoiceKindSubtitle({
        kind: "variation",
        quoteDocNumber: "Q-0005",
        percent: null,
      }),
    ).toBe("Variation of Q-0005");
    expect(invoicePanelTitle("INV-0003", "deposit")).toBe("Invoice INV-0003 · Deposit");
    expect(invoicePanelTitle("INV-0001", "standard")).toBe("Invoice INV-0001");
    expect(
      invoiceKindSubtitle({
        kind: "recurring",
        quoteDocNumber: "",
        percent: null,
      }),
    ).toBe("Recurring");
    expect(invoicePanelTitle("INV-0005", "recurring")).toBe("Invoice INV-0005 · Recurring");
  });
});
