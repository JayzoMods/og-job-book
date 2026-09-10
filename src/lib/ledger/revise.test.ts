import { describe, expect, it } from "vitest";
import {
  canReviseQuote,
  duplicateJobFields,
  hasDraftRevision,
  liveInvoiceCountOnQuote,
  quoteRevisionLabel,
  shouldSupersedeOnSend,
} from "./revise";

describe("duplicateJobFields", () => {
  it("copies customer, description, notes, and inspection fields onto a new enquiry", () => {
    expect(
      duplicateJobFields({
        id: "job-1",
        customerId: "cust-1",
        description: "Roof leak after storms — inspection only",
        notes: "Called after the storm.",
        propertyAddress: "22 Illawarra Road, Marrickville NSW 2204",
        vendorName: "",
        purchaserName: "Samira Chen",
        reportType: "roof",
      }),
    ).toEqual({
      customerId: "cust-1",
      description: "Roof leak after storms — inspection only",
      notes: "Called after the storm.",
      propertyAddress: "22 Illawarra Road, Marrickville NSW 2204",
      vendorName: "",
      purchaserName: "Samira Chen",
      reportType: "roof",
      status: "enquiry",
      duplicatedFromJobId: "job-1",
    });
  });
});

describe("liveInvoiceCountOnQuote", () => {
  it("counts non-void invoices and treats empty or unmatched as 0", () => {
    expect(liveInvoiceCountOnQuote([], "q1")).toBe(0);
    expect(liveInvoiceCountOnQuote([{ quoteId: "q1", status: "paid" }], "")).toBe(0);
    expect(
      liveInvoiceCountOnQuote(
        [
          { quoteId: "q1", status: "sent" },
          { quoteId: "q1", status: "void" },
          { quoteId: "q2", status: "paid" },
        ],
        "q1",
      ),
    ).toBe(1);
  });
});

describe("hasDraftRevision", () => {
  it("is true only for a draft that points at this quote", () => {
    expect(hasDraftRevision([], "q1")).toBe(false);
    expect(
      hasDraftRevision([{ revisedFromQuoteId: "q1", status: "draft" }], "q1"),
    ).toBe(true);
    expect(
      hasDraftRevision([{ revisedFromQuoteId: "q1", status: "sent" }], "q1"),
    ).toBe(false);
  });
});

describe("canReviseQuote", () => {
  it("allows sent and declined, and accepted with nothing billed", () => {
    expect(
      canReviseQuote({
        jobStatus: "quoted",
        quoteStatus: "sent",
        liveInvoiceCount: 0,
        hasDraftRevision: false,
      }),
    ).toBe(true);
    expect(
      canReviseQuote({
        jobStatus: "quoted",
        quoteStatus: "declined",
        liveInvoiceCount: 0,
        hasDraftRevision: false,
      }),
    ).toBe(true);
    expect(
      canReviseQuote({
        jobStatus: "accepted",
        quoteStatus: "accepted",
        liveInvoiceCount: 0,
        hasDraftRevision: false,
      }),
    ).toBe(true);
  });

  it("rejects draft, superseded, billed accepted, cancelled, and an open draft revision", () => {
    expect(
      canReviseQuote({
        jobStatus: "enquiry",
        quoteStatus: "draft",
        liveInvoiceCount: 0,
        hasDraftRevision: false,
      }),
    ).toBe(false);
    expect(
      canReviseQuote({
        jobStatus: "quoted",
        quoteStatus: "superseded",
        liveInvoiceCount: 0,
        hasDraftRevision: false,
      }),
    ).toBe(false);
    expect(
      canReviseQuote({
        jobStatus: "invoiced",
        quoteStatus: "accepted",
        liveInvoiceCount: 1,
        hasDraftRevision: false,
      }),
    ).toBe(false);
    expect(
      canReviseQuote({
        jobStatus: "cancelled",
        quoteStatus: "sent",
        liveInvoiceCount: 0,
        hasDraftRevision: false,
      }),
    ).toBe(false);
    expect(
      canReviseQuote({
        jobStatus: "quoted",
        quoteStatus: "sent",
        liveInvoiceCount: 0,
        hasDraftRevision: true,
      }),
    ).toBe(false);
  });
});

describe("shouldSupersedeOnSend", () => {
  it("supersedes sent and accepted, not declined or empty", () => {
    expect(shouldSupersedeOnSend("sent")).toBe(true);
    expect(shouldSupersedeOnSend("accepted")).toBe(true);
    expect(shouldSupersedeOnSend("declined")).toBe(false);
    expect(shouldSupersedeOnSend("")).toBe(false);
  });
});

describe("quoteRevisionLabel", () => {
  it("labels a source number and treats empty as none", () => {
    expect(quoteRevisionLabel("Q-0001")).toBe("Revision of Q-0001");
    expect(quoteRevisionLabel("")).toBeNull();
    expect(quoteRevisionLabel("  ")).toBeNull();
    expect(quoteRevisionLabel(null)).toBeNull();
  });
});
