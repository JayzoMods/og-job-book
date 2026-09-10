import { describe, expect, it, vi } from "vitest";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import { computeDocument } from "./tax";
import {
  accountingSkipReason,
  accountingWriteConfigured,
  canWriteCredit,
  canWriteInvoice,
  describeAccountingSkip,
  invoiceDateForWrite,
  myobClientIdFromEnv,
  myobServiceInvoicePayload,
  myobServiceInvoiceUrl,
  myobTaxCode,
  myobWriteConfigured,
  parseAccountingWrite,
  parseMyobCompanyFileUri,
  xeroAccessTokenFromEnv,
  xeroCreditNotePayload,
  xeroInvoicePayload,
  xeroLineAmountTypes,
  xeroTaxType,
  xeroTenantIdFromEnv,
  xeroWriteConfigured,
  writeAccountingDocument,
  XERO_CREDIT_NOTES_URL,
  XERO_INVOICES_URL,
} from "./accounting";

const TEST_XERO_TOKEN = "xero_test_token";
const TEST_XERO_TENANT = "11111111-1111-4111-8111-111111111111";
const TEST_MYOB_TOKEN = "myob_test_token";
const TEST_MYOB_CLIENT = "myob_test_client";
const TEST_MYOB_CF = "https://api.myob.com/accountright/22222222-2222-4222-8222-222222222222";
const INV_0002 = demoSeed.invoices.find((row) => row.id === DEMO_IDS.invoiceUnpaid);
const INV_0004 = demoSeed.invoices.find((row) => row.id === DEMO_IDS.invoiceVariation);
const CN_0001 = demoSeed.creditNotes.find((row) => row.id === DEMO_IDS.creditNote);
const ALEX = demoSeed.customers.find((row) => row.id === DEMO_IDS.customerInvoiced);
const JORDAN = demoSeed.customers.find((row) => row.id === DEMO_IDS.customerClaims);

function inv0002Lines() {
  if (!INV_0002) {
    throw new Error("missing INV-0002");
  }
  return INV_0002.lines;
}

describe("xeroWriteConfigured and myobWriteConfigured", () => {
  it("treats blank tokens as off and needs every required value", () => {
    expect(xeroAccessTokenFromEnv({})).toBeUndefined();
    expect(xeroAccessTokenFromEnv({ XERO_ACCESS_TOKEN: "  " })).toBeUndefined();
    expect(xeroTenantIdFromEnv({})).toBeUndefined();
    expect(xeroWriteConfigured({})).toBe(false);
    expect(xeroWriteConfigured({ XERO_ACCESS_TOKEN: TEST_XERO_TOKEN })).toBe(false);
    expect(
      xeroWriteConfigured({
        XERO_ACCESS_TOKEN: TEST_XERO_TOKEN,
        XERO_TENANT_ID: TEST_XERO_TENANT,
      }),
    ).toBe(true);
    expect(myobClientIdFromEnv({})).toBeUndefined();
    expect(myobWriteConfigured({})).toBe(false);
    expect(
      myobWriteConfigured({
        MYOB_ACCESS_TOKEN: TEST_MYOB_TOKEN,
        MYOB_CLIENT_ID: TEST_MYOB_CLIENT,
      }),
    ).toBe(false);
    expect(
      myobWriteConfigured({
        MYOB_ACCESS_TOKEN: TEST_MYOB_TOKEN,
        MYOB_CLIENT_ID: TEST_MYOB_CLIENT,
        MYOB_CF_URI: TEST_MYOB_CF,
      }),
    ).toBe(true);
    expect(accountingWriteConfigured({})).toBe(false);
  });
});

describe("parseMyobCompanyFileUri", () => {
  it("rejects empty, http, and junk; keeps https accountright URIs", () => {
    expect(parseMyobCompanyFileUri("")).toBeNull();
    expect(parseMyobCompanyFileUri("   ")).toBeNull();
    expect(parseMyobCompanyFileUri("not-a-url")).toBeNull();
    expect(parseMyobCompanyFileUri("http://api.myob.com/accountright/x")).toBeNull();
    expect(parseMyobCompanyFileUri("https://api.myob.com/other/x")).toBeNull();
    expect(parseMyobCompanyFileUri(`${TEST_MYOB_CF}/`)).toBe(TEST_MYOB_CF);
  });
});

describe("parseAccountingWrite", () => {
  it("rejects empty and junk bodies", () => {
    expect(parseAccountingWrite(null).ok).toBe(false);
    expect(parseAccountingWrite(undefined).ok).toBe(false);
    expect(parseAccountingWrite("").ok).toBe(false);
    expect(parseAccountingWrite({}).ok).toBe(false);
    expect(parseAccountingWrite({ provider: "xero", kind: "invoice" }).ok).toBe(false);
    expect(
      parseAccountingWrite({
        provider: "quickbooks",
        kind: "invoice",
        id: DEMO_IDS.invoiceUnpaid,
      }).ok,
    ).toBe(false);
  });

  it("accepts INV-0002 for Xero and strips extra keys", () => {
    const parsed = parseAccountingWrite({
      provider: "xero",
      kind: "invoice",
      id: DEMO_IDS.invoiceUnpaid,
      extra: true,
    });
    expect(parsed).toEqual({
      ok: true,
      payload: {
        provider: "xero",
        kind: "invoice",
        id: DEMO_IDS.invoiceUnpaid,
      },
    });
  });
});

describe("canWriteInvoice and canWriteCredit", () => {
  it("blocks draft and void; allows sent, paid, and issued", () => {
    expect(canWriteInvoice("draft")).toBe(false);
    expect(canWriteInvoice("void")).toBe(false);
    expect(canWriteInvoice("")).toBe(false);
    expect(canWriteInvoice("sent")).toBe(true);
    expect(canWriteInvoice("paid")).toBe(true);
    expect(canWriteCredit("void")).toBe(false);
    expect(canWriteCredit("issued")).toBe(true);
  });
});

describe("accountingSkipReason", () => {
  it("orders no_key, not_supported, then not_payable", () => {
    expect(
      accountingSkipReason({
        provider: "xero",
        kind: "invoice",
        configured: false,
        status: "sent",
        customerName: "Alex Moretti",
        lineCount: 1,
      }),
    ).toBe("no_key");
    expect(
      accountingSkipReason({
        provider: "myob",
        kind: "credit",
        configured: true,
        status: "issued",
        customerName: "Alex Moretti",
        lineCount: 1,
      }),
    ).toBe("not_supported");
    expect(
      accountingSkipReason({
        provider: "xero",
        kind: "invoice",
        configured: true,
        status: "draft",
        customerName: "Alex Moretti",
        lineCount: 1,
      }),
    ).toBe("not_payable");
    expect(
      accountingSkipReason({
        provider: "xero",
        kind: "invoice",
        configured: true,
        status: "sent",
        customerName: "",
        lineCount: 1,
      }),
    ).toBe("not_payable");
    expect(
      describeAccountingSkip("no_key"),
    ).toMatch(/not available/);
  });
});

describe("tax maps", () => {
  it("maps AU sales codes; unregistered GST is free on income", () => {
    expect(xeroTaxType("GST", true)).toBe("OUTPUT");
    expect(xeroTaxType("GST", false)).toBe("EXEMPTOUTPUT");
    expect(xeroTaxType("GST_FREE", true)).toBe("EXEMPTOUTPUT");
    expect(xeroTaxType("BAS_EXCLUDED", true)).toBe("BASEXCLUDED");
    expect(xeroTaxType("INPUT_TAXED", true)).toBe("INPUTTAXED");
    expect(myobTaxCode("GST", true)).toBe("GST");
    expect(myobTaxCode("GST", false)).toBe("FRE");
    expect(myobTaxCode("GST_FREE", true)).toBe("FRE");
    expect(myobTaxCode("BAS_EXCLUDED", true)).toBe("N-T");
    expect(myobTaxCode("INPUT_TAXED", true)).toBe("INP");
  });
});

describe("xeroInvoicePayload", () => {
  it("pins INV-0002 at $550 inclusive, not the $440 due now after CN-0001", () => {
    if (!INV_0002 || !ALEX) {
      throw new Error("missing INV-0002");
    }
    const issuedOn = invoiceDateForWrite(INV_0002.dueDate, INV_0002.paymentTermsDays);
    expect(issuedOn).toBe("2026-08-18");
    expect(computeDocument(INV_0002.lines).totalCents).toBe(55000);
    const payload = xeroInvoicePayload({
      customerName: ALEX.name,
      docNumber: INV_0002.docNumber,
      issuedOn: issuedOn ?? "",
      dueDate: INV_0002.dueDate,
      reference: "Pest inspection before settlement",
      gstRegistered: true,
      lines: inv0002Lines(),
      salesAccount: "200",
    });
    expect(payload.Type).toBe("ACCREC");
    expect(payload.InvoiceNumber).toBe("INV-0002");
    expect(payload.CurrencyCode).toBe("AUD");
    expect(payload.Status).toBe("AUTHORISED");
    expect(payload.LineAmountTypes).toBe("Inclusive");
    expect(payload.Contact).toEqual({ Name: "Alex Moretti" });
    expect(payload.Date).toBe("2026-08-18");
    expect(payload.DueDate).toBe("2026-09-01");
    const items = payload.LineItems as Array<{ UnitAmount: number; TaxType: string }>;
    expect(items[0]?.UnitAmount).toBe(550);
    expect(items[0]?.UnitAmount).not.toBe(440);
    expect(items[0]?.TaxType).toBe("OUTPUT");
  });

  it("pins INV-0004 at $330, not $313.50 after retention held", () => {
    if (!INV_0004 || !JORDAN) {
      throw new Error("missing INV-0004");
    }
    expect(INV_0004.retentionHeldCents).toBe(1650);
    const payload = xeroInvoicePayload({
      customerName: JORDAN.name,
      docNumber: INV_0004.docNumber,
      issuedOn: "2026-09-09",
      dueDate: INV_0004.dueDate,
      reference: "Storm rectification",
      gstRegistered: true,
      lines: INV_0004.lines,
      salesAccount: "200",
    });
    const items = payload.LineItems as Array<{ UnitAmount: number }>;
    expect(items[0]?.UnitAmount).toBe(330);
    expect(items[0]?.UnitAmount).not.toBe(313.5);
  });
});

describe("xeroCreditNotePayload", () => {
  it("pins CN-0001 at $110 inclusive GST against INV-0002", () => {
    if (!CN_0001 || !ALEX) {
      throw new Error("missing CN-0001");
    }
    expect(computeDocument(CN_0001.lines).totalCents).toBe(11000);
    expect(computeDocument(CN_0001.lines).gstCents).toBe(1000);
    const payload = xeroCreditNotePayload({
      customerName: ALEX.name,
      docNumber: CN_0001.docNumber,
      issuedOn: "2026-09-09",
      reference: "INV-0002",
      gstRegistered: true,
      lines: CN_0001.lines,
      salesAccount: "200",
    });
    expect(payload.Type).toBe("ACCRECCREDIT");
    expect(payload.CreditNoteNumber).toBe("CN-0001");
    const items = payload.LineItems as Array<{ UnitAmount: number; TaxType: string }>;
    expect(items[0]?.UnitAmount).toBe(110);
    expect(items[0]?.TaxType).toBe("OUTPUT");
  });
});

describe("myobServiceInvoicePayload", () => {
  it("posts INV-0002 as a tax-inclusive service invoice at $550", () => {
    if (!INV_0002 || !ALEX) {
      throw new Error("missing INV-0002");
    }
    expect(myobServiceInvoiceUrl(TEST_MYOB_CF)).toBe(`${TEST_MYOB_CF}/Sale/Invoice/Service`);
    const payload = myobServiceInvoicePayload({
      customerName: ALEX.name,
      docNumber: INV_0002.docNumber,
      issuedOn: "2026-08-18",
      dueDate: INV_0002.dueDate,
      reference: "Pest inspection before settlement",
      gstRegistered: true,
      lines: inv0002Lines(),
      incomeAccount: "4-1000",
    });
    expect(payload.Number).toBe("INV-0002");
    expect(payload.IsTaxInclusive).toBe(true);
    const lines = payload.Lines as Array<{ Total: number; TaxCode: { Code: string } }>;
    expect(lines[0]?.Total).toBe(550);
    expect(lines[0]?.TaxCode.Code).toBe("GST");
  });
});

describe("xeroLineAmountTypes", () => {
  it("uses Exclusive when any line is exclusive", () => {
    expect(
      xeroLineAmountTypes([
        {
          description: "Hours",
          quantity: 1,
          unitPriceCents: 10000,
          taxCode: "GST",
          amountKind: "exclusive",
        },
      ]),
    ).toBe("Exclusive");
  });
});

describe("writeAccountingDocument", () => {
  it("skips without calling fetch when the Xero token is unset", async () => {
    const fetchImpl = vi.fn();
    const result = await writeAccountingDocument({
      provider: "xero",
      kind: "invoice",
      status: "sent",
      docNumber: "INV-0002",
      customerName: "Alex Moretti",
      jobDescription: "Pest inspection before settlement",
      issuedOn: "2026-08-18",
      dueDate: "2026-09-01",
      gstRegistered: true,
      lines: inv0002Lines(),
      xeroAccessToken: "",
      xeroTenantId: TEST_XERO_TENANT,
      fetchImpl,
    });
    expect(result).toEqual({ status: "skipped", reason: "no_key" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not POST a draft invoice", async () => {
    const fetchImpl = vi.fn();
    const result = await writeAccountingDocument({
      provider: "xero",
      kind: "invoice",
      status: "draft",
      docNumber: "INV-0002",
      customerName: "Alex Moretti",
      jobDescription: "Pest",
      issuedOn: "2026-08-18",
      dueDate: "2026-09-01",
      gstRegistered: true,
      lines: inv0002Lines(),
      xeroAccessToken: TEST_XERO_TOKEN,
      xeroTenantId: TEST_XERO_TENANT,
      fetchImpl,
    });
    expect(result).toEqual({ status: "skipped", reason: "not_payable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not POST a MYOB credit note", async () => {
    if (!CN_0001) {
      throw new Error("missing CN-0001");
    }
    const fetchImpl = vi.fn();
    const result = await writeAccountingDocument({
      provider: "myob",
      kind: "credit",
      status: "issued",
      docNumber: "CN-0001",
      customerName: "Alex Moretti",
      jobDescription: "Pest",
      issuedOn: "2026-09-09",
      gstRegistered: true,
      lines: CN_0001.lines,
      myobAccessToken: TEST_MYOB_TOKEN,
      myobClientId: TEST_MYOB_CLIENT,
      myobCompanyFileUri: TEST_MYOB_CF,
      fetchImpl,
    });
    expect(result).toEqual({ status: "skipped", reason: "not_supported" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts INV-0002 to Xero at $550 and keeps the token out of errors", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(XERO_INVOICES_URL);
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${TEST_XERO_TOKEN}`);
      expect(headers.get("Xero-tenant-id")).toBe(TEST_XERO_TENANT);
      const body = JSON.parse(String(init?.body)) as {
        Invoices: Array<{
          InvoiceNumber: string;
          LineItems: Array<{ UnitAmount: number }>;
        }>;
      };
      expect(body.Invoices[0]?.InvoiceNumber).toBe("INV-0002");
      expect(body.Invoices[0]?.LineItems[0]?.UnitAmount).toBe(550);
      return new Response(
        JSON.stringify({
          Invoices: [{ InvoiceID: "33333333-3333-4333-8333-333333333333" }],
        }),
        { status: 200 },
      );
    });
    const result = await writeAccountingDocument({
      provider: "xero",
      kind: "invoice",
      status: "sent",
      docNumber: "INV-0002",
      customerName: "Alex Moretti",
      jobDescription: "Pest inspection before settlement",
      issuedOn: "2026-08-18",
      dueDate: "2026-09-01",
      gstRegistered: true,
      lines: inv0002Lines(),
      xeroAccessToken: TEST_XERO_TOKEN,
      xeroTenantId: TEST_XERO_TENANT,
      fetchImpl,
    });
    expect(result).toEqual({
      status: "written",
      id: "33333333-3333-4333-8333-333333333333",
      provider: "xero",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("posts CN-0001 to Xero CreditNotes", async () => {
    if (!CN_0001) {
      throw new Error("missing CN-0001");
    }
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(XERO_CREDIT_NOTES_URL);
      const body = JSON.parse(String(init?.body)) as {
        CreditNotes: Array<{ CreditNoteNumber: string }>;
      };
      expect(body.CreditNotes[0]?.CreditNoteNumber).toBe("CN-0001");
      return new Response(
        JSON.stringify({
          CreditNotes: [{ CreditNoteID: "44444444-4444-4444-8444-444444444444" }],
        }),
        { status: 200 },
      );
    });
    const result = await writeAccountingDocument({
      provider: "xero",
      kind: "credit",
      status: "issued",
      docNumber: "CN-0001",
      customerName: "Alex Moretti",
      jobDescription: "Pest inspection before settlement",
      issuedOn: "2026-09-09",
      gstRegistered: true,
      lines: CN_0001.lines,
      againstDocNumber: "INV-0002",
      xeroAccessToken: TEST_XERO_TOKEN,
      xeroTenantId: TEST_XERO_TENANT,
      fetchImpl,
    });
    expect(result.status).toBe("written");
  });

  it("posts INV-0002 to MYOB Sale/Invoice/Service", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${TEST_MYOB_CF}/Sale/Invoice/Service`);
      const headers = new Headers(init?.headers);
      expect(headers.get("x-myobapi-key")).toBe(TEST_MYOB_CLIENT);
      const body = JSON.parse(String(init?.body)) as { Number: string };
      expect(body.Number).toBe("INV-0002");
      return new Response(
        JSON.stringify({ UID: "55555555-5555-4555-8555-555555555555" }),
        { status: 200 },
      );
    });
    const result = await writeAccountingDocument({
      provider: "myob",
      kind: "invoice",
      status: "sent",
      docNumber: "INV-0002",
      customerName: "Alex Moretti",
      jobDescription: "Pest inspection before settlement",
      issuedOn: "2026-08-18",
      dueDate: "2026-09-01",
      gstRegistered: true,
      lines: inv0002Lines(),
      myobAccessToken: TEST_MYOB_TOKEN,
      myobClientId: TEST_MYOB_CLIENT,
      myobCompanyFileUri: TEST_MYOB_CF,
      fetchImpl,
    });
    expect(result).toEqual({
      status: "written",
      id: "55555555-5555-4555-8555-555555555555",
      provider: "myob",
    });
  });

  it("maps HTTP 401 without echoing the token", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ Message: "TokenExpired" }), { status: 401 }),
    );
    const result = await writeAccountingDocument({
      provider: "xero",
      kind: "invoice",
      status: "sent",
      docNumber: "INV-0002",
      customerName: "Alex Moretti",
      jobDescription: "Pest",
      issuedOn: "2026-08-18",
      dueDate: "2026-09-01",
      gstRegistered: true,
      lines: inv0002Lines(),
      xeroAccessToken: TEST_XERO_TOKEN,
      xeroTenantId: TEST_XERO_TENANT,
      fetchImpl,
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") {
      throw new Error("expected error");
    }
    expect(result.reason).toBe("http");
    expect(result.message).toContain("401");
    expect(result.message).not.toContain(TEST_XERO_TOKEN);
  });

  it("rejects a Xero body with no InvoiceID", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const result = await writeAccountingDocument({
      provider: "xero",
      kind: "invoice",
      status: "paid",
      docNumber: "INV-0001",
      customerName: "Priya Shah",
      jobDescription: "Annual safety inspection",
      issuedOn: "2026-08-01",
      dueDate: "2026-08-15",
      gstRegistered: true,
      lines: inv0002Lines(),
      xeroAccessToken: TEST_XERO_TOKEN,
      xeroTenantId: TEST_XERO_TENANT,
      fetchImpl,
    });
    expect(result).toEqual({
      status: "error",
      reason: "parse",
      message: "Xero did not return an invoice or credit note id",
    });
  });
});
