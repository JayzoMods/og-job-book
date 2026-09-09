import type { TaxCode } from "./tax";

export const INVOICE_KINDS = [
  "standard",
  "deposit",
  "progress",
  "variation",
  "retention",
  "recurring",
] as const;

export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const RETENTION_PERCENT_OPTIONS = [0, 5, 10] as const;

const CONTRACT_KINDS = new Set<InvoiceKind>(["standard", "deposit", "progress"]);
const HOLD_KINDS = new Set<InvoiceKind>(["standard", "deposit", "progress", "variation"]);

const KIND_SET = new Set<string>(INVOICE_KINDS);

/** Empty, junk, and unknown kinds are a standard invoice (existing seed rows). */
export function parseInvoiceKind(raw: string | null | undefined): InvoiceKind {
  const normalised = (raw ?? "").trim().toLowerCase();
  if (KIND_SET.has(normalised)) {
    return normalised as InvoiceKind;
  }
  return "standard";
}

export function isContractKind(kind: InvoiceKind): boolean {
  return CONTRACT_KINDS.has(kind);
}

export function holdsRetention(kind: InvoiceKind): boolean {
  return HOLD_KINDS.has(kind);
}

export function invoiceKindLabel(kind: InvoiceKind): string {
  if (kind === "deposit") {
    return "Deposit";
  }
  if (kind === "progress") {
    return "Progress claim";
  }
  if (kind === "variation") {
    return "Variation";
  }
  if (kind === "retention") {
    return "Retention release";
  }
  if (kind === "recurring") {
    return "Recurring";
  }
  return "Invoice";
}

/** Whole percent 1–100. Empty, 0, decimals, and junk → null. */
export function parseClaimPercent(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < 1 || raw > 100) {
      return null;
    }
    return raw;
  }
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "" || !/^\d+$/.test(trimmed)) {
    return null;
  }
  const n = Number.parseInt(trimmed, 10);
  if (n < 1 || n > 100) {
    return null;
  }
  return n;
}

/** Empty, junk, and values other than 0 / 5 / 10 → 0 (do not hold money by accident). */
export function parseRetentionPercent(raw: string | number | null | undefined): number {
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "").trim(), 10);
  if (n === 0 || n === 5 || n === 10) {
    return n;
  }
  return 0;
}

export function percentOfCents(totalCents: number, percent: number): number {
  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    return 0;
  }
  return Math.round((totalCents * percent) / 100);
}

export function retentionHeldCents(totalCents: number, retentionPercent: number): number {
  const percent = parseRetentionPercent(retentionPercent);
  if (percent === 0 || totalCents <= 0) {
    return 0;
  }
  return percentOfCents(totalCents, percent);
}

export function remainingContractCents(quoteTotalCents: number, claimedCents: number): number {
  return Math.max(0, quoteTotalCents - claimedCents);
}

export function claimExceedsRemaining(claimCents: number, remainingCents: number): boolean {
  return claimCents > remainingCents;
}

export function claimedCentsFromInvoices(
  invoices: Array<{ quoteId: string | null; status: string; kind: string; totalCents: number }>,
  quoteId: string,
): number {
  return invoices
    .filter(
      (invoice) =>
        invoice.quoteId === quoteId &&
        invoice.status !== "void" &&
        isContractKind(parseInvoiceKind(invoice.kind)),
    )
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);
}

export function netRetentionHeldCents(
  invoices: Array<{
    quoteId: string | null;
    status: string;
    kind: string;
    retentionHeldCents: number;
    totalCents: number;
  }>,
  quoteId: string,
): number {
  let held = 0;
  let released = 0;
  for (const invoice of invoices) {
    if (invoice.quoteId !== quoteId || invoice.status === "void") {
      continue;
    }
    const kind = parseInvoiceKind(invoice.kind);
    if (holdsRetention(kind)) {
      held += invoice.retentionHeldCents;
    }
    if (kind === "retention") {
      released += invoice.totalCents;
    }
  }
  return Math.max(0, held - released);
}

export function nextJobStatusFromInvoices(
  invoices: Array<{ status: string }>,
): "accepted" | "invoiced" | "paid" {
  const live = invoices.filter((invoice) => invoice.status !== "void");
  if (live.length === 0) {
    return "accepted";
  }
  if (live.every((invoice) => invoice.status === "paid")) {
    return "paid";
  }
  return "invoiced";
}

export function claimTaxCode(taxCodes: string[]): TaxCode {
  if (taxCodes.some((code) => code === "GST")) {
    return "GST";
  }
  if (taxCodes.some((code) => code === "GST_FREE")) {
    return "GST_FREE";
  }
  return "GST";
}

export function claimLineDescription(input: {
  kind: "deposit" | "progress" | "retention";
  quoteDocNumber: string;
  percent: number | null;
  remainder: boolean;
}): string {
  if (input.kind === "retention") {
    return `Retention release of ${input.quoteDocNumber}`;
  }
  if (input.kind === "deposit") {
    return `Deposit ${input.percent ?? 0}% of ${input.quoteDocNumber}`;
  }
  if (input.remainder) {
    return `Progress claim — remainder of ${input.quoteDocNumber}`;
  }
  return `Progress claim ${input.percent ?? 0}% of ${input.quoteDocNumber}`;
}

export function invoiceKindSubtitle(input: {
  kind: InvoiceKind;
  quoteDocNumber: string;
  percent: number | null;
}): string | undefined {
  if (input.kind === "standard") {
    return undefined;
  }
  if (input.kind === "recurring") {
    return "Recurring";
  }
  if (input.kind === "variation") {
    return `Variation of ${input.quoteDocNumber}`;
  }
  if (input.kind === "retention") {
    return `Retention release of ${input.quoteDocNumber}`;
  }
  if (input.kind === "deposit") {
    return `Deposit ${input.percent ?? 0}% of ${input.quoteDocNumber}`;
  }
  if (input.percent === null) {
    return `Progress claim — remainder of ${input.quoteDocNumber}`;
  }
  return `Progress claim ${input.percent}% of ${input.quoteDocNumber}`;
}

export function invoicePanelTitle(docNumber: string, kind: InvoiceKind): string {
  if (kind === "standard") {
    return `Invoice ${docNumber}`;
  }
  return `Invoice ${docNumber} · ${invoiceKindLabel(kind)}`;
}
