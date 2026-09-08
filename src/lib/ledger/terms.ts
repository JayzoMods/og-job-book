import { addDaysIso } from "./tax";

export const DEFAULT_PAYMENT_TERMS_DAYS = 14;
export const DEFAULT_QUOTE_VALID_DAYS = 30;
export const PAYMENT_TERMS_OPTIONS = [0, 7, 14, 30, 60] as const;

export type PaymentTermsDays = (typeof PAYMENT_TERMS_OPTIONS)[number];

/** Empty, junk, and negative → 14 days. 0 is due on receipt. Cap 365. */
export function parsePaymentTermsDays(raw: string | number | null | undefined): number {
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 0) {
    return DEFAULT_PAYMENT_TERMS_DAYS;
  }
  return Math.min(365, Math.trunc(n));
}

export function paymentTermsLabel(days: number): string {
  const n = parsePaymentTermsDays(days);
  if (n === 0) {
    return "Due on receipt";
  }
  if (n === 1) {
    return "1 day";
  }
  return `${n} days`;
}

export function parseIsoDate(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
}

export function defaultQuoteValidUntil(today: string): string {
  return addDaysIso(today, DEFAULT_QUOTE_VALID_DAYS);
}

export function dueDateFromTerms(today: string, days: number): string {
  return addDaysIso(today, parsePaymentTermsDays(days));
}

/** Sent quotes only. Valid-until is inclusive (expired the next calendar day). */
export function quoteIsExpired(input: {
  status: string;
  validUntil: string | null | undefined;
  today: string;
}): boolean {
  if (input.status !== "sent") {
    return false;
  }
  const until = parseIsoDate(input.validUntil);
  if (!until) {
    return false;
  }
  return until < input.today;
}

export function quoteDocumentStatus(
  status: string,
  validUntil: string | null | undefined,
  today: string,
): string {
  return quoteIsExpired({ status, validUntil, today }) ? `${status} · expired` : status;
}

/** Unpaid sent invoices past due. Same-day due is not overdue. Paid and void never are. */
export function invoiceIsOverdue(input: {
  status: string;
  dueDate: string;
  remainingCents: number;
  today: string;
}): boolean {
  if (input.status === "void" || input.status === "paid" || input.status === "draft") {
    return false;
  }
  if (input.remainingCents <= 0) {
    return false;
  }
  const due = parseIsoDate(input.dueDate);
  if (!due) {
    return false;
  }
  return due < input.today;
}

export function invoiceDocumentStatus(
  status: string,
  payState: string,
  overdue: boolean,
): string {
  return overdue ? `${status} · ${payState} · overdue` : `${status} · ${payState}`;
}
