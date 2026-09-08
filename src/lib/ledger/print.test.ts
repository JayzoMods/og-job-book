import { describe, expect, it } from "vitest";
import { formatIsoDateAu, formatInstantAu, printDocumentTitle } from "./print";

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

  it("marks a draft quote", () => {
    expect(
      printDocumentTitle({
        kind: "quote",
        docNumber: "Q-0003",
        status: "draft",
        gstRegistered: true,
      }),
    ).toBe("Quote Q-0003 (draft)");
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
