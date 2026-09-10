import { describe, expect, it } from "vitest";
import { isValidAbn } from "./abn";
import { computeDocument } from "./tax";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import {
  canApplySampleBooks,
  JOB_FORM_TEMPLATES,
  ORG_FORM_TEMPLATES,
  parseTemplateOrgId,
  remapDemoSeed,
} from "./templates";

const ACCOUNT_ORG = "b0000000-0000-4000-8000-000000000001";

function sequentialIds() {
  let n = 2;
  return () => {
    const next = `b0000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
    n += 1;
    return next;
  };
}

function sequentialShares() {
  let n = 1;
  return (existing: string) => {
    const token = `T${String(n).padStart(42, "0")}`;
    n += 1;
    void existing;
    return token;
  };
}

describe("parseTemplateOrgId", () => {
  it("rejects empty and junk", () => {
    expect(parseTemplateOrgId("")).toBeNull();
    expect(parseTemplateOrgId("   ")).toBeNull();
    expect(parseTemplateOrgId("not-a-uuid")).toBeNull();
    expect(parseTemplateOrgId(null)).toBeNull();
  });

  it("accepts a UUID", () => {
    expect(parseTemplateOrgId(ACCOUNT_ORG)).toBe(ACCOUNT_ORG);
  });
});

describe("canApplySampleBooks", () => {
  it("is off when sign-in is off, trial is locked, or books already have rows", () => {
    expect(
      canApplySampleBooks({
        authOn: false,
        trialWriteAllowed: true,
        jobCount: 0,
        customerCount: 0,
        rateCount: 0,
      }),
    ).toBe(false);
    expect(
      canApplySampleBooks({
        authOn: true,
        trialWriteAllowed: false,
        jobCount: 0,
        customerCount: 0,
        rateCount: 0,
      }),
    ).toBe(false);
    expect(
      canApplySampleBooks({
        authOn: true,
        trialWriteAllowed: true,
        jobCount: 1,
        customerCount: 0,
        rateCount: 0,
      }),
    ).toBe(false);
  });

  it("rejects non-integer counts", () => {
    expect(
      canApplySampleBooks({
        authOn: true,
        trialWriteAllowed: true,
        jobCount: 0.5,
        customerCount: 0,
        rateCount: 0,
      }),
    ).toBe(false);
    expect(
      canApplySampleBooks({
        authOn: true,
        trialWriteAllowed: true,
        jobCount: -1,
        customerCount: 0,
        rateCount: 0,
      }),
    ).toBe(false);
  });

  it("allows an empty signed-in account", () => {
    expect(
      canApplySampleBooks({
        authOn: true,
        trialWriteAllowed: true,
        jobCount: 0,
        customerCount: 0,
        rateCount: 0,
      }),
    ).toBe(true);
  });
});

describe("remapDemoSeed", () => {
  it("returns null for an empty org id and when share tokens are not rotated", () => {
    const nextId = sequentialIds();
    expect(
      remapDemoSeed(demoSeed, {
        orgId: "",
        nextId,
        nextShareToken: sequentialShares(),
      }),
    ).toBeNull();
    expect(
      remapDemoSeed(demoSeed, {
        orgId: ACCOUNT_ORG,
        nextId: sequentialIds(),
        nextShareToken: (existing) => existing,
      }),
    ).toBeNull();
  });

  it("remaps FKs onto the account org and keeps Q-0001 money", () => {
    const remapped = remapDemoSeed(demoSeed, {
      orgId: ACCOUNT_ORG,
      nextId: sequentialIds(),
      nextShareToken: sequentialShares(),
    });
    expect(remapped).not.toBeNull();
    expect(remapped!.org.id).toBe(ACCOUNT_ORG);
    expect(remapped!.org.id).not.toBe(DEMO_IDS.org);
    expect(remapped!.jobs).toHaveLength(demoSeed.jobs.length);

    const ids = new Set<string>([remapped!.org.id]);
    for (const job of remapped!.jobs) {
      expect(ids.has(job.id)).toBe(false);
      ids.add(job.id);
      expect(remapped!.customers.some((customer) => customer.id === job.customerId)).toBe(
        true,
      );
    }
    const duplicate = remapped!.jobs.find(
      (job) => job.duplicatedFromJobId != null && job.duplicatedFromJobId !== "",
    );
    expect(duplicate?.duplicatedFromJobId).toBeTruthy();
    expect(remapped!.jobs.some((job) => job.id === duplicate?.duplicatedFromJobId)).toBe(
      true,
    );

    const mixed = remapped!.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(mixed).toBeDefined();
    expect(mixed!.shareToken).toBeTruthy();
    expect(mixed!.shareToken).not.toBe(DEMO_IDS.quoteMixedShare);
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
    expect(computeDocument(mixed!.lines).gstCents).toBe(11000);

    const draft = remapped!.quotes.find((quote) => quote.docNumber === "Q-0003");
    expect(draft?.shareToken ?? null).toBeNull();

    for (const invoice of remapped!.invoices) {
      expect(remapped!.jobs.some((job) => job.id === invoice.jobId)).toBe(true);
      expect(remapped!.quotes.some((quote) => quote.id === invoice.quoteId)).toBe(true);
    }
  });
});

describe("form templates", () => {
  it("fills organisation fields with a valid ABR-example ABN", () => {
    expect(ORG_FORM_TEMPLATES.map((template) => template.id)).toEqual([
      "harbourline",
      "electrical",
    ]);
    for (const template of ORG_FORM_TEMPLATES) {
      expect(isValidAbn(template.fields.abn)).toBe(true);
      expect(template.fields.name).toMatch(/Pty Ltd/);
      expect(template.fields.address.length).toBeGreaterThan(8);
      expect(template.fields.gstRegistered).toBe("yes");
    }
  });

  it("fills job fields without picking an existing customer id", () => {
    expect(JOB_FORM_TEMPLATES.map((template) => template.id)).toEqual([
      "pre-purchase",
      "roof",
      "safety",
    ]);
    for (const template of JOB_FORM_TEMPLATES) {
      expect(template.fields.customerId).toBe("");
      expect(template.fields.customerName.length).toBeGreaterThan(0);
      expect(template.fields.suburb.length).toBeGreaterThan(0);
      expect(template.fields.description.length).toBeGreaterThan(0);
      expect(["pre_purchase", "roof", "safety"]).toContain(template.fields.reportType);
    }
  });
});
