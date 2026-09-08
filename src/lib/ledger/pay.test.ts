import { describe, expect, it } from "vitest";
import {
  formatBsb,
  hasInvoicePayDetails,
  invoicePayDetails,
  invoicePayLines,
  parseAccountNumber,
  parseBsb,
  parsePayId,
} from "./pay";

describe("parseBsb", () => {
  it("treats empty and wrong length as empty", () => {
    expect(parseBsb("")).toBe("");
    expect(parseBsb(undefined)).toBe("");
    expect(parseBsb("06200")).toBe("");
    expect(parseBsb("0620000")).toBe("");
  });

  it("keeps six digits from dashed or spaced input", () => {
    expect(parseBsb("062-000")).toBe("062000");
    expect(parseBsb("000 000")).toBe("000000");
  });
});

describe("formatBsb", () => {
  it("formats six digits as XXX-XXX", () => {
    expect(formatBsb("000000")).toBe("000-000");
    expect(formatBsb("062-000")).toBe("062-000");
    expect(formatBsb("")).toBe("");
  });
});

describe("parseAccountNumber", () => {
  it("treats empty, short, and long as empty", () => {
    expect(parseAccountNumber("")).toBe("");
    expect(parseAccountNumber("123")).toBe("");
    expect(parseAccountNumber("12345678901")).toBe("");
  });

  it("keeps 4 to 10 digits", () => {
    expect(parseAccountNumber("0001")).toBe("0001");
    expect(parseAccountNumber("0001 2345")).toBe("00012345");
  });
});

describe("parsePayId", () => {
  it("trims and caps length without checking the type", () => {
    expect(parsePayId("  harbourline@example.com  ")).toBe("harbourline@example.com");
    expect(parsePayId("")).toBe("");
    expect(parsePayId("x".repeat(81)).length).toBe(80);
  });
});

describe("invoice pay display", () => {
  it("hides the block when PayID, BSB, and account are empty", () => {
    const empty = invoicePayDetails({ accountName: "Harbourline" });
    expect(hasInvoicePayDetails(empty)).toBe(false);
    expect(invoicePayLines(empty)).toEqual([]);
  });

  it("lists PayID and BSB without claiming they were verified", () => {
    const details = invoicePayDetails({
      accountName: "Harbourline Inspections Pty Ltd",
      bsb: "000-000",
      accountNumber: "00012345",
      payId: "harbourline@example.com",
    });
    expect(hasInvoicePayDetails(details)).toBe(true);
    expect(invoicePayLines(details)).toEqual([
      { label: "Account name", value: "Harbourline Inspections Pty Ltd" },
      { label: "BSB", value: "000-000" },
      { label: "Account", value: "00012345" },
      { label: "PayID", value: "harbourline@example.com" },
    ]);
  });
});
