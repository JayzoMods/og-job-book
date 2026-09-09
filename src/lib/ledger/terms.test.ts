import { describe, expect, it } from "vitest";
import { addDaysIso } from "./tax";
import {
  defaultQuoteValidUntil,
  dueDateFromTerms,
  invoiceDocumentStatus,
  invoiceIsOverdue,
  parseIsoDate,
  parsePaymentTermsDays,
  paymentTermsLabel,
  quoteDocumentStatus,
  quoteIsExpired,
} from "./terms";

describe("parsePaymentTermsDays", () => {
  it("treats empty and unknown as 14", () => {
    expect(parsePaymentTermsDays("")).toBe(14);
    expect(parsePaymentTermsDays(undefined)).toBe(14);
    expect(parsePaymentTermsDays("net")).toBe(14);
    expect(parsePaymentTermsDays(-1)).toBe(14);
  });

  it("keeps due on receipt and caps at a year", () => {
    expect(parsePaymentTermsDays(0)).toBe(0);
    expect(parsePaymentTermsDays("0")).toBe(0);
    expect(parsePaymentTermsDays(400)).toBe(365);
    expect(parsePaymentTermsDays("7")).toBe(7);
  });
});

describe("paymentTermsLabel", () => {
  it("labels zero as due on receipt", () => {
    expect(paymentTermsLabel(0)).toBe("Due on receipt");
    expect(paymentTermsLabel(14)).toBe("14 days");
    expect(paymentTermsLabel(1)).toBe("1 day");
  });
});

describe("parseIsoDate", () => {
  it("accepts calendar YYYY-MM-DD and rejects junk", () => {
    expect(parseIsoDate("2026-09-08")).toBe("2026-09-08");
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("08/09/2026")).toBeNull();
    expect(parseIsoDate("2026-02-31")).toBeNull();
  });
});

describe("quote expiry", () => {
  it("expires a sent quote the day after valid-until", () => {
    expect(
      quoteIsExpired({
        status: "sent",
        validUntil: "2026-09-01",
        today: "2026-09-08",
      }),
    ).toBe(true);
    expect(
      quoteIsExpired({
        status: "sent",
        validUntil: "2026-09-08",
        today: "2026-09-08",
      }),
    ).toBe(false);
  });

  it("does not expire draft, accepted, declined, or superseded quotes", () => {
    expect(
      quoteIsExpired({
        status: "draft",
        validUntil: "2026-01-01",
        today: "2026-09-08",
      }),
    ).toBe(false);
    expect(
      quoteIsExpired({
        status: "accepted",
        validUntil: "2026-01-01",
        today: "2026-09-08",
      }),
    ).toBe(false);
    expect(
      quoteIsExpired({
        status: "declined",
        validUntil: "2026-01-01",
        today: "2026-09-08",
      }),
    ).toBe(false);
    expect(
      quoteIsExpired({
        status: "superseded",
        validUntil: "2026-01-01",
        today: "2026-09-08",
      }),
    ).toBe(false);
  });

  it("treats empty valid-until as not expired", () => {
    expect(
      quoteIsExpired({ status: "sent", validUntil: "", today: "2026-09-08" }),
    ).toBe(false);
  });

  it("labels sent expired quotes without changing the stored status", () => {
    expect(quoteDocumentStatus("sent", "2026-09-01", "2026-09-08")).toBe(
      "sent · expired",
    );
    expect(quoteDocumentStatus("sent", "2026-09-30", "2026-09-08")).toBe("sent");
  });
});

describe("invoice overdue", () => {
  it("is overdue when sent, unpaid, and past due", () => {
    expect(
      invoiceIsOverdue({
        status: "sent",
        dueDate: "2026-09-01",
        remainingCents: 55000,
        today: "2026-09-08",
      }),
    ).toBe(true);
  });

  it("is not overdue on the due day, when paid, void, or fully recorded", () => {
    expect(
      invoiceIsOverdue({
        status: "sent",
        dueDate: "2026-09-08",
        remainingCents: 55000,
        today: "2026-09-08",
      }),
    ).toBe(false);
    expect(
      invoiceIsOverdue({
        status: "paid",
        dueDate: "2026-08-15",
        remainingCents: 0,
        today: "2026-09-08",
      }),
    ).toBe(false);
    expect(
      invoiceIsOverdue({
        status: "void",
        dueDate: "2026-09-01",
        remainingCents: 55000,
        today: "2026-09-08",
      }),
    ).toBe(false);
    expect(
      invoiceIsOverdue({
        status: "sent",
        dueDate: "2026-09-01",
        remainingCents: 0,
        today: "2026-09-08",
      }),
    ).toBe(false);
  });

  it("keeps a partial unpaid invoice overdue", () => {
    expect(
      invoiceIsOverdue({
        status: "sent",
        dueDate: "2026-09-01",
        remainingCents: 100,
        today: "2026-09-08",
      }),
    ).toBe(true);
    expect(invoiceDocumentStatus("sent", "partial", true)).toBe(
      "sent · partial · overdue",
    );
    expect(invoiceDocumentStatus("sent", "unpaid", false)).toBe("sent · unpaid");
  });
});

describe("defaults", () => {
  it("uses 30 days for quote validity and 14 days for invoice due", () => {
    expect(defaultQuoteValidUntil("2026-09-08")).toBe("2026-10-08");
    expect(dueDateFromTerms("2026-09-08", 14)).toBe("2026-09-22");
    expect(dueDateFromTerms("2026-09-08", 0)).toBe("2026-09-08");
    expect(addDaysIso("2026-09-08", 14)).toBe("2026-09-22");
  });
});
