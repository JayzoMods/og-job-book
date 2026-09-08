import { describe, expect, it } from "vitest";
import {
  creditExceedsBalance,
  creditedCentsFromNotes,
  invoiceBalanceCents,
  invoicePayState,
  invoiceSettlement,
  parseCreditReason,
} from "./credit";

describe("parseCreditReason", () => {
  it("trims empty and junk to empty", () => {
    expect(parseCreditReason("")).toBe("");
    expect(parseCreditReason("   ")).toBe("");
    expect(parseCreditReason(null)).toBe("");
    expect(parseCreditReason(undefined)).toBe("");
  });

  it("keeps a short reason and cuts at 200 characters", () => {
    expect(parseCreditReason("  Access delay  ")).toBe("Access delay");
    expect(parseCreditReason("x".repeat(201)).length).toBe(200);
  });
});

describe("creditedCentsFromNotes", () => {
  it("sums issued notes and ignores void", () => {
    expect(creditedCentsFromNotes([])).toBe(0);
    expect(
      creditedCentsFromNotes([
        { status: "issued", totalCents: 11000 },
        { status: "void", totalCents: 44000 },
      ]),
    ).toBe(11000);
  });
});

describe("invoiceBalanceCents", () => {
  it("subtracts paid and credited, and does not go below zero", () => {
    expect(invoiceBalanceCents(55000, 0, 0)).toBe(55000);
    expect(invoiceBalanceCents(55000, 0, 11000)).toBe(44000);
    expect(invoiceBalanceCents(55000, 44000, 11000)).toBe(0);
    expect(invoiceBalanceCents(55000, 0, 99000)).toBe(0);
  });
});

describe("creditExceedsBalance", () => {
  it("allows a credit equal to the remaining balance and rejects over", () => {
    expect(creditExceedsBalance(11000, 11000)).toBe(false);
    expect(creditExceedsBalance(11001, 11000)).toBe(true);
    expect(creditExceedsBalance(0, 0)).toBe(false);
  });
});

describe("invoicePayState", () => {
  it("stays unpaid when a credit leaves a balance and nothing is recorded", () => {
    expect(
      invoicePayState({ paidCents: 0, remainingCents: 44000, creditedCents: 11000 }),
    ).toBe("unpaid");
  });

  it("is credited when credits cover the invoice and nothing is recorded", () => {
    expect(
      invoicePayState({ paidCents: 0, remainingCents: 0, creditedCents: 55000 }),
    ).toBe("credited");
  });

  it("is paid when remaining is zero and any payment was recorded", () => {
    expect(
      invoicePayState({ paidCents: 44000, remainingCents: 0, creditedCents: 11000 }),
    ).toBe("paid");
  });

  it("is partial when a payment leaves a balance", () => {
    expect(
      invoicePayState({ paidCents: 10000, remainingCents: 34000, creditedCents: 11000 }),
    ).toBe("partial");
  });
});

describe("invoiceSettlement", () => {
  it("pins the demo INV-0002 remaining after a $110 credit", () => {
    expect(
      invoiceSettlement({
        invoiceTotalCents: 55000,
        paidCents: 0,
        creditedCents: 11000,
      }),
    ).toEqual({ remainingCents: 44000, payState: "unpaid" });
  });
});
