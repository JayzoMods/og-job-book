import { describe, expect, it } from "vitest";
import { DEMO_IDS } from "../../data/demo-seed";
import {
  formatIsoDateAu,
  formatInstantAu,
  printDocumentTitle,
  printGstQuarterTitle,
  printRemittanceTitle,
  printStatementTitle,
  shouldWatermarkPrint,
} from "./print";

describe("printDocumentTitle", () => {
  it("labels a sent quote with its number", () => {
    expect(
      printDocumentTitle({
        kind: "quote",
        docNumber: "Q-0001",
        status: "sent",
        gstRegistered: true,
      }),
    ).toBe("Quote Q-0001");
  });

  it("marks a superseded quote", () => {
    expect(
      printDocumentTitle({
        kind: "quote",
        docNumber: "Q-0001",
        status: "superseded",
        gstRegistered: true,
      }),
    ).toBe("Quote Q-0001 (superseded)");
  });

  it("uses Tax invoice when the org is GST-registered", () => {
    expect(
      printDocumentTitle({
        kind: "invoice",
        docNumber: "INV-0001",
        status: "paid",
        gstRegistered: true,
      }),
    ).toBe("Tax invoice INV-0001");
  });

  it("does not say Tax invoice when the org is not GST-registered", () => {
    expect(
      printDocumentTitle({
        kind: "invoice",
        docNumber: "INV-0002",
        status: "sent",
        gstRegistered: false,
      }),
    ).toBe("Invoice INV-0002");
  });

  it("marks a void invoice", () => {
    expect(
      printDocumentTitle({
        kind: "invoice",
        docNumber: "INV-0002",
        status: "void",
        gstRegistered: true,
      }),
    ).toBe("Tax invoice INV-0002 (void)");
  });

  it("labels a credit note with its number, not Tax invoice", () => {
    expect(
      printDocumentTitle({
        kind: "credit",
        docNumber: "CN-0001",
        status: "issued",
        gstRegistered: true,
      }),
    ).toBe("Credit note CN-0001");
  });

  it("marks a void credit note", () => {
    expect(
      printDocumentTitle({
        kind: "credit",
        docNumber: "CN-0001",
        status: "void",
        gstRegistered: true,
      }),
    ).toBe("Credit note CN-0001 (void)");
  });
});

describe("printStatementTitle", () => {
  it("does not say Tax invoice", () => {
    expect(printStatementTitle()).toBe("Statement of account");
    expect(printRemittanceTitle()).toBe("Remittance advice");
    expect(printGstQuarterTitle()).toBe("GST quarter report");
    expect(printGstQuarterTitle()).not.toMatch(/tax invoice/i);
    expect(printGstQuarterTitle()).not.toMatch(/BAS/i);
  });
});

describe("formatIsoDateAu", () => {
  it("formats an ISO calendar date in en-AU", () => {
    expect(formatIsoDateAu("2026-08-15")).toBe("15 Aug 2026");
  });

  it("returns empty input and junk unchanged", () => {
    expect(formatIsoDateAu("")).toBe("");
    expect(formatIsoDateAu("not-a-date")).toBe("not-a-date");
  });
});

describe("formatInstantAu", () => {
  it("uses the Australia/Sydney calendar day", () => {
    expect(formatInstantAu(new Date("2026-09-07T14:00:00.000Z"))).toMatch(
      /^8 Sept? 2026$/,
    );
  });
});

describe("shouldWatermarkPrint", () => {
  it("marks the fixed Load demo organisation", () => {
    expect(
      shouldWatermarkPrint({
        orgId: DEMO_IDS.org,
        isAdmin: true,
        trialStartedAt: null,
      }),
    ).toBe(true);
  });

  it("marks signed-in trial accounts, including after Fill sample books", () => {
    expect(
      shouldWatermarkPrint({
        orgId: "b0000000-0000-4000-8000-000000000099",
        isAdmin: false,
        trialStartedAt: new Date("2026-09-11T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("skips admin accounts that are not on the demo org id", () => {
    expect(
      shouldWatermarkPrint({
        orgId: "b0000000-0000-4000-8000-000000000099",
        isAdmin: true,
        trialStartedAt: new Date("2026-09-11T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("skips open books that are not the demo org", () => {
    expect(
      shouldWatermarkPrint({
        orgId: "b0000000-0000-4000-8000-000000000099",
        isAdmin: false,
        trialStartedAt: null,
      }),
    ).toBe(false);
  });
});
