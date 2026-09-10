import { z } from "zod";
import { centsToDollars } from "./money";
import { invoiceIssuedOn } from "./statement";
import {
  computeDocument,
  parseAmountKind,
  parseTaxCode,
  type LineInput,
  type TaxCode,
} from "./tax";

export const XERO_INVOICES_URL = "https://api.xero.com/api.xro/2.0/Invoices";
export const XERO_CREDIT_NOTES_URL = "https://api.xero.com/api.xro/2.0/CreditNotes";
export const DEFAULT_XERO_SALES_ACCOUNT = "200";
export const DEFAULT_MYOB_INCOME_ACCOUNT = "4-1000";
const SEND_TIMEOUT_MS = 8_000;
const XERO_REFERENCE_MAX = 255;

export const ACCOUNTING_WRITE_NOTE =
  "Posts a live invoice (full lines, not amount due now) to Xero or MYOB. Credit notes go to Xero only. Off until Xero or MYOB tokens are set. Leave those unset on a public no-login deploy. Not OAuth. Not a BAS. Not Confirmation of Payee.";

export const ACCOUNTING_PROVIDERS = ["xero", "myob"] as const;
export type AccountingProvider = (typeof ACCOUNTING_PROVIDERS)[number];

export const ACCOUNTING_KINDS = ["invoice", "credit"] as const;
export type AccountingDocumentKind = (typeof ACCOUNTING_KINDS)[number];

export type AccountingSkipReason = "no_key" | "not_payable" | "not_supported";

export type AccountingWriteResult =
  | { status: "skipped"; reason: AccountingSkipReason }
  | { status: "error"; reason: "network" | "http" | "parse"; message: string }
  | { status: "written"; id: string; provider: AccountingProvider };

export type ParseAccountingWriteResult =
  | {
      ok: true;
      payload: { provider: AccountingProvider; kind: AccountingDocumentKind; id: string };
    }
  | { ok: false; issues: string[] };

const payloadSchema = z.object({
  provider: z.enum(ACCOUNTING_PROVIDERS),
  kind: z.enum(ACCOUNTING_KINDS),
  id: z.string().uuid(),
});

export function xeroAccessTokenFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const token = env.XERO_ACCESS_TOKEN?.trim();
  return token ? token : undefined;
}

export function xeroTenantIdFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const tenant = env.XERO_TENANT_ID?.trim();
  return tenant ? tenant : undefined;
}

export function xeroSalesAccountFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const code = env.XERO_SALES_ACCOUNT_CODE?.trim();
  return code ? code : DEFAULT_XERO_SALES_ACCOUNT;
}

export function xeroWriteConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(xeroAccessTokenFromEnv(env) && xeroTenantIdFromEnv(env));
}

export function myobAccessTokenFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const token = env.MYOB_ACCESS_TOKEN?.trim();
  return token ? token : undefined;
}

export function myobClientIdFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const id = env.MYOB_CLIENT_ID?.trim();
  return id ? id : undefined;
}

export function myobIncomeAccountFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const code = env.MYOB_INCOME_ACCOUNT?.trim();
  return code ? code : DEFAULT_MYOB_INCOME_ACCOUNT;
}

/** https company-file URI with /accountright/. Trailing slash stripped. */
export function parseMyobCompanyFileUri(
  raw: string | number | null | undefined,
): string | null {
  const trimmed = String(raw ?? "").trim().replace(/\/$/, "");
  if (trimmed === "") {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") {
      return null;
    }
    if (!url.pathname.toLowerCase().includes("/accountright/")) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

export function myobCompanyFileUriFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const parsed = parseMyobCompanyFileUri(env.MYOB_CF_URI);
  return parsed ?? undefined;
}

export function myobWriteConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    myobAccessTokenFromEnv(env) &&
      myobClientIdFromEnv(env) &&
      myobCompanyFileUriFromEnv(env),
  );
}

export function accountingWriteConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return xeroWriteConfigured(env) || myobWriteConfigured(env);
}

export function providerWriteConfigured(
  provider: AccountingProvider,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return provider === "xero" ? xeroWriteConfigured(env) : myobWriteConfigured(env);
}

export function canWriteInvoice(status: string): boolean {
  return status === "sent" || status === "paid";
}

export function canWriteCredit(status: string): boolean {
  return status === "issued";
}

export function canWriteDocument(kind: AccountingDocumentKind, status: string): boolean {
  return kind === "invoice" ? canWriteInvoice(status) : canWriteCredit(status);
}

export function accountingSkipReason(input: {
  provider: AccountingProvider;
  kind: AccountingDocumentKind;
  configured: boolean;
  status: string;
  customerName: string;
  lineCount: number;
}): AccountingSkipReason | null {
  if (!input.configured) {
    return "no_key";
  }
  if (input.provider === "myob" && input.kind === "credit") {
    return "not_supported";
  }
  if (!canWriteDocument(input.kind, input.status)) {
    return "not_payable";
  }
  if (input.customerName.trim() === "" || input.lineCount < 1) {
    return "not_payable";
  }
  return null;
}

export function describeAccountingSkip(reason: AccountingSkipReason): string {
  if (reason === "no_key") {
    return "Accounting write is off until Xero (XERO_ACCESS_TOKEN and XERO_TENANT_ID) or MYOB (MYOB_ACCESS_TOKEN, MYOB_CLIENT_ID, and MYOB_CF_URI) are set on this deploy. Leave those unset on a public no-login site.";
  }
  if (reason === "not_supported") {
    return "MYOB write is a service invoice only. Credit notes go to Xero. Not a cash refund.";
  }
  return "Only a sent or paid invoice, or an issued credit note, can be written. Drafts and void documents are not posted. Quotes stay in this ledger.";
}

export function xeroTaxType(taxCode: TaxCode, gstRegistered: boolean): string {
  if (!gstRegistered && taxCode === "GST") {
    return "EXEMPTOUTPUT";
  }
  if (taxCode === "GST") {
    return "OUTPUT";
  }
  if (taxCode === "GST_FREE") {
    return "EXEMPTOUTPUT";
  }
  if (taxCode === "BAS_EXCLUDED") {
    return "BASEXCLUDED";
  }
  return "INPUTTAXED";
}

export function myobTaxCode(taxCode: TaxCode, gstRegistered: boolean): string {
  if (!gstRegistered && taxCode === "GST") {
    return "FRE";
  }
  if (taxCode === "GST") {
    return "GST";
  }
  if (taxCode === "GST_FREE") {
    return "FRE";
  }
  if (taxCode === "BAS_EXCLUDED") {
    return "N-T";
  }
  return "INP";
}

export function xeroLineAmountTypes(lines: LineInput[]): "Inclusive" | "Exclusive" {
  return lines.every((line) => parseAmountKind(line.amountKind) === "inclusive")
    ? "Inclusive"
    : "Exclusive";
}

function clipReference(raw: string): string {
  return raw.trim().slice(0, XERO_REFERENCE_MAX);
}

export function invoiceDateForWrite(
  dueDate: string,
  paymentTermsDays: number,
): string | null {
  return invoiceIssuedOn(dueDate, paymentTermsDays);
}

function exclusiveUnitDollars(line: LineInput, gstRegistered: boolean): number {
  const computed = computeDocument([line], gstRegistered).lines[0];
  if (!computed || line.quantity === 0) {
    return centsToDollars(line.unitPriceCents);
  }
  const exclusiveCents = computed.amountCents - computed.gstCents;
  return centsToDollars(Math.round(exclusiveCents / line.quantity));
}

function unitAmountDollars(
  line: LineInput,
  lineAmountTypes: "Inclusive" | "Exclusive",
  gstRegistered: boolean,
): number {
  if (lineAmountTypes === "Inclusive") {
    return centsToDollars(line.unitPriceCents);
  }
  if (parseAmountKind(line.amountKind) === "exclusive") {
    return centsToDollars(line.unitPriceCents);
  }
  return exclusiveUnitDollars(line, gstRegistered);
}

function toWriteLines(lines: LineInput[]): LineInput[] {
  return lines.filter((line) => line.description.trim() !== "");
}

export function xeroInvoicePayload(input: {
  customerName: string;
  docNumber: string;
  issuedOn: string;
  dueDate: string;
  reference: string;
  gstRegistered: boolean;
  lines: LineInput[];
  salesAccount: string;
}): Record<string, unknown> {
  const lineAmountTypes = xeroLineAmountTypes(input.lines);
  return {
    Type: "ACCREC",
    Contact: { Name: input.customerName.trim() },
    InvoiceNumber: input.docNumber,
    Date: input.issuedOn,
    DueDate: input.dueDate,
    Reference: clipReference(input.reference),
    CurrencyCode: "AUD",
    Status: "AUTHORISED",
    LineAmountTypes: lineAmountTypes,
    LineItems: toWriteLines(input.lines).map((line) => ({
      Description: line.description.trim(),
      Quantity: line.quantity,
      UnitAmount: unitAmountDollars(line, lineAmountTypes, input.gstRegistered),
      AccountCode: input.salesAccount,
      TaxType: xeroTaxType(line.taxCode, input.gstRegistered),
    })),
  };
}

export function xeroCreditNotePayload(input: {
  customerName: string;
  docNumber: string;
  issuedOn: string;
  reference: string;
  gstRegistered: boolean;
  lines: LineInput[];
  salesAccount: string;
}): Record<string, unknown> {
  const lineAmountTypes = xeroLineAmountTypes(input.lines);
  return {
    Type: "ACCRECCREDIT",
    Contact: { Name: input.customerName.trim() },
    CreditNoteNumber: input.docNumber,
    Date: input.issuedOn,
    Reference: clipReference(input.reference),
    CurrencyCode: "AUD",
    Status: "AUTHORISED",
    LineAmountTypes: lineAmountTypes,
    LineItems: toWriteLines(input.lines).map((line) => ({
      Description: line.description.trim(),
      Quantity: line.quantity,
      UnitAmount: unitAmountDollars(line, lineAmountTypes, input.gstRegistered),
      AccountCode: input.salesAccount,
      TaxType: xeroTaxType(line.taxCode, input.gstRegistered),
    })),
  };
}

export function myobServiceInvoiceUrl(companyFileUri: string): string {
  return `${companyFileUri}/Sale/Invoice/Service`;
}

export function myobServiceInvoicePayload(input: {
  customerName: string;
  docNumber: string;
  issuedOn: string;
  dueDate: string;
  reference: string;
  gstRegistered: boolean;
  lines: LineInput[];
  incomeAccount: string;
}): Record<string, unknown> {
  const inclusive = xeroLineAmountTypes(input.lines) === "Inclusive";
  return {
    Number: input.docNumber,
    Date: `${input.issuedOn}T00:00:00`,
    Customer: { Name: input.customerName.trim() },
    IsTaxInclusive: inclusive,
    JournalMemo: clipReference(input.reference),
    Terms: { DueDate: `${input.dueDate}T00:00:00` },
    Lines: toWriteLines(input.lines).map((line) => ({
      Type: "Transaction",
      Description: line.description.trim(),
      Total:
        unitAmountDollars(line, inclusive ? "Inclusive" : "Exclusive", input.gstRegistered) *
        line.quantity,
      Account: { DisplayID: input.incomeAccount },
      TaxCode: { Code: myobTaxCode(line.taxCode, input.gstRegistered) },
    })),
  };
}

function asRemoteId(payload: unknown, kind: AccountingDocumentKind): string | null {
  if (payload == null || typeof payload !== "object") {
    return null;
  }
  const row = payload as {
    UID?: unknown;
    Invoices?: unknown;
    CreditNotes?: unknown;
  };
  if (typeof row.UID === "string" && row.UID.trim() !== "") {
    return row.UID.trim();
  }
  const list = kind === "credit" ? row.CreditNotes : row.Invoices;
  if (!Array.isArray(list) || list.length === 0 || list[0] == null || typeof list[0] !== "object") {
    return null;
  }
  const first = list[0] as { InvoiceID?: unknown; CreditNoteID?: unknown; UID?: unknown };
  const id =
    kind === "credit"
      ? first.CreditNoteID ?? first.UID
      : first.InvoiceID ?? first.UID;
  if (typeof id !== "string" || id.trim() === "") {
    return null;
  }
  return id.trim();
}

function httpErrorMessage(status: number, payload: unknown): string {
  if (payload != null && typeof payload === "object") {
    const direct = payload as { Message?: unknown; message?: unknown };
    if (typeof direct.Message === "string" && direct.Message.trim() !== "") {
      return `HTTP ${status}: ${direct.Message.trim().slice(0, 200)}`;
    }
    if (typeof direct.message === "string" && direct.message.trim() !== "") {
      return `HTTP ${status}: ${direct.message.trim().slice(0, 200)}`;
    }
    const elements = (payload as { Elements?: unknown }).Elements;
    if (Array.isArray(elements) && elements[0] != null && typeof elements[0] === "object") {
      const errors = (elements[0] as { ValidationErrors?: unknown }).ValidationErrors;
      if (Array.isArray(errors) && errors[0] != null && typeof errors[0] === "object") {
        const message = (errors[0] as { Message?: unknown }).Message;
        if (typeof message === "string" && message.trim() !== "") {
          return `HTTP ${status}: ${message.trim().slice(0, 200)}`;
        }
      }
    }
  }
  return `HTTP ${status}`;
}

export interface WriteAccountingInput {
  provider: AccountingProvider;
  kind: AccountingDocumentKind;
  status: string;
  docNumber: string;
  customerName: string;
  jobDescription: string;
  issuedOn: string;
  dueDate?: string | null;
  gstRegistered: boolean;
  lines: LineInput[];
  againstDocNumber?: string | null;
  xeroAccessToken?: string | null;
  xeroTenantId?: string | null;
  xeroSalesAccount?: string | null;
  myobAccessToken?: string | null;
  myobClientId?: string | null;
  myobCompanyFileUri?: string | null;
  myobIncomeAccount?: string | null;
  fetchImpl?: typeof fetch;
}

function resolvedXero(input: WriteAccountingInput): {
  token?: string;
  tenant?: string;
  salesAccount: string;
} {
  const token =
    input.xeroAccessToken === undefined
      ? xeroAccessTokenFromEnv()
      : input.xeroAccessToken?.trim() || undefined;
  const tenant =
    input.xeroTenantId === undefined
      ? xeroTenantIdFromEnv()
      : input.xeroTenantId?.trim() || undefined;
  const salesAccount =
    input.xeroSalesAccount === undefined
      ? xeroSalesAccountFromEnv()
      : input.xeroSalesAccount?.trim() || DEFAULT_XERO_SALES_ACCOUNT;
  return { token, tenant, salesAccount };
}

function resolvedMyob(input: WriteAccountingInput): {
  token?: string;
  clientId?: string;
  companyFileUri?: string;
  incomeAccount: string;
} {
  const token =
    input.myobAccessToken === undefined
      ? myobAccessTokenFromEnv()
      : input.myobAccessToken?.trim() || undefined;
  const clientId =
    input.myobClientId === undefined
      ? myobClientIdFromEnv()
      : input.myobClientId?.trim() || undefined;
  const companyFileUri =
    input.myobCompanyFileUri === undefined
      ? myobCompanyFileUriFromEnv()
      : parseMyobCompanyFileUri(input.myobCompanyFileUri) ?? undefined;
  const incomeAccount =
    input.myobIncomeAccount === undefined
      ? myobIncomeAccountFromEnv()
      : input.myobIncomeAccount?.trim() || DEFAULT_MYOB_INCOME_ACCOUNT;
  return { token, clientId, companyFileUri, incomeAccount };
}

export async function writeAccountingDocument(
  input: WriteAccountingInput,
): Promise<AccountingWriteResult> {
  const writeLines = toWriteLines(input.lines);
  const xero = resolvedXero(input);
  const myob = resolvedMyob(input);
  const configured =
    input.provider === "xero"
      ? Boolean(xero.token && xero.tenant)
      : Boolean(myob.token && myob.clientId && myob.companyFileUri);
  const skip = accountingSkipReason({
    provider: input.provider,
    kind: input.kind,
    configured,
    status: input.status,
    customerName: input.customerName,
    lineCount: writeLines.length,
  });
  if (skip) {
    return { status: "skipped", reason: skip };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const dueDate = input.dueDate?.trim() || input.issuedOn;
  const reference =
    input.kind === "credit"
      ? input.againstDocNumber?.trim() || input.jobDescription
      : input.jobDescription;

  let url: string;
  let headers: Record<string, string>;
  let body: unknown;

  if (input.provider === "xero") {
    url = input.kind === "credit" ? XERO_CREDIT_NOTES_URL : XERO_INVOICES_URL;
    headers = {
      Authorization: `Bearer ${xero.token}`,
      "Xero-tenant-id": xero.tenant ?? "",
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (input.kind === "credit") {
      body = {
        CreditNotes: [
          xeroCreditNotePayload({
            customerName: input.customerName,
            docNumber: input.docNumber,
            issuedOn: input.issuedOn,
            reference,
            gstRegistered: input.gstRegistered,
            lines: writeLines,
            salesAccount: xero.salesAccount,
          }),
        ],
      };
    } else {
      body = {
        Invoices: [
          xeroInvoicePayload({
            customerName: input.customerName,
            docNumber: input.docNumber,
            issuedOn: input.issuedOn,
            dueDate,
            reference,
            gstRegistered: input.gstRegistered,
            lines: writeLines,
            salesAccount: xero.salesAccount,
          }),
        ],
      };
    }
  } else {
    url = myobServiceInvoiceUrl(myob.companyFileUri ?? "");
    headers = {
      Authorization: `Bearer ${myob.token}`,
      "x-myobapi-key": myob.clientId ?? "",
      "x-myobapi-version": "v2",
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    body = myobServiceInvoicePayload({
      customerName: input.customerName,
      docNumber: input.docNumber,
      issuedOn: input.issuedOn,
      dueDate,
      reference,
      gstRegistered: input.gstRegistered,
      lines: writeLines,
      incomeAccount: myob.incomeAccount,
    });
  }

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers,
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    let payload: unknown = null;
    if (raw.trim() !== "") {
      try {
        payload = JSON.parse(raw) as unknown;
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      return { status: "error", reason: "http", message: httpErrorMessage(response.status, payload) };
    }
    const id = asRemoteId(payload, input.kind);
    if (!id) {
      return {
        status: "error",
        reason: "parse",
        message:
          input.provider === "xero"
            ? "Xero did not return an invoice or credit note id"
            : "MYOB did not return a UID",
      };
    }
    return { status: "written", id, provider: input.provider };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { status: "error", reason: "network", message: "timed out" };
    }
    return { status: "error", reason: "network", message: "network error" };
  }
}

/** Empty, junk, and unknown provider/kind are rejected. Extra keys are stripped. */
export function parseAccountingWrite(json: unknown): ParseAccountingWriteResult {
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }
  return { ok: true, payload: parsed.data };
}

export function accountingRejectStatus(
  reason: AccountingSkipReason | "missing",
): 404 | 409 {
  return reason === "missing" ? 404 : 409;
}

export function parseAccountingLines(
  lines: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    taxCode: string;
    amountKind: string;
  }>,
): LineInput[] {
  return lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    taxCode: parseTaxCode(line.taxCode) ?? "GST",
    amountKind: parseAmountKind(line.amountKind),
  }));
}
