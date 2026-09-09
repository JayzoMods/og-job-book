import { invoiceKindLabel, parseInvoiceKind, type InvoiceKind } from "./claim";
import { invoiceSettlement, type InvoicePayState } from "./credit";
import { addDaysIso } from "./tax";
import { invoiceIsOverdue, parseIsoDate, parsePaymentTermsDays } from "./terms";

export const AGE_BUCKETS = [
  "current",
  "days1to30",
  "days31to60",
  "days61to90",
  "days90plus",
] as const;

export type AgeBucket = (typeof AGE_BUCKETS)[number];

export type StatementDates =
  | { ok: true; asAt: string; from: string | null }
  | { ok: false };

/** Empty as-at → today. Empty from is open. Junk or from after as-at → reject. */
export function parseStatementDates(
  asAtRaw: string | null | undefined,
  fromRaw: string | null | undefined,
  today: string,
): StatementDates {
  const asAtTrim = String(asAtRaw ?? "").trim();
  const asAt = asAtTrim === "" ? parseIsoDate(today) : parseIsoDate(asAtTrim);
  if (!asAt) {
    return { ok: false };
  }
  const fromTrim = String(fromRaw ?? "").trim();
  if (fromTrim === "") {
    return { ok: true, asAt, from: null };
  }
  const from = parseIsoDate(fromTrim);
  if (!from) {
    return { ok: false };
  }
  if (from > asAt) {
    return { ok: false };
  }
  return { ok: true, asAt, from };
}

/** Invoice date is due minus stamped terms (inverse of dueDateFromTerms). Junk due → null. */
export function invoiceIssuedOn(
  dueDate: string,
  paymentTermsDays: number,
): string | null {
  const due = parseIsoDate(dueDate);
  if (!due) {
    return null;
  }
  return addDaysIso(due, -parsePaymentTermsDays(paymentTermsDays));
}

export function calendarDaysBetween(earlier: string, later: string): number | null {
  const a = parseIsoDate(earlier);
  const b = parseIsoDate(later);
  if (!a || !b) {
    return null;
  }
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

export function ageBucket(input: {
  dueDate: string;
  remainingCents: number;
  asAt: string;
}): AgeBucket | null {
  if (input.remainingCents <= 0) {
    return null;
  }
  const due = parseIsoDate(input.dueDate);
  const asAt = parseIsoDate(input.asAt);
  if (!due || !asAt) {
    return null;
  }
  if (due >= asAt) {
    return "current";
  }
  const days = calendarDaysBetween(due, asAt);
  if (days === null) {
    return null;
  }
  if (days <= 30) {
    return "days1to30";
  }
  if (days <= 60) {
    return "days31to60";
  }
  if (days <= 90) {
    return "days61to90";
  }
  return "days90plus";
}

export function ageBucketLabel(bucket: AgeBucket): string {
  if (bucket === "current") {
    return "Current";
  }
  if (bucket === "days1to30") {
    return "1–30 days";
  }
  if (bucket === "days31to60") {
    return "31–60 days";
  }
  if (bucket === "days61to90") {
    return "61–90 days";
  }
  return "90+ days";
}

export function invoiceOnStatement(input: {
  status: string;
  dueDate: string;
  paymentTermsDays: number;
  asAt: string;
  from: string | null;
}): boolean {
  if (input.status === "void" || input.status === "draft") {
    return false;
  }
  const issuedOn = invoiceIssuedOn(input.dueDate, input.paymentTermsDays);
  if (!issuedOn) {
    return input.from === null;
  }
  if (issuedOn > input.asAt) {
    return false;
  }
  if (input.from && issuedOn < input.from) {
    return false;
  }
  return true;
}

export function paidCentsAsAt(
  payments: Array<{ paidOn: string; amountCents: number }>,
  asAt: string,
): number {
  return payments.reduce((sum, payment) => {
    const on = parseIsoDate(payment.paidOn);
    if (!on || on > asAt) {
      return sum;
    }
    return sum + payment.amountCents;
  }, 0);
}

export type StatementInvoiceInput = {
  id: string;
  jobId: string;
  jobDescription: string;
  docNumber: string;
  status: string;
  kind: string;
  dueDate: string;
  paymentTermsDays: number;
  totalCents: number;
  creditedCents: number;
  retentionHeldCents: number;
  payments: Array<{ paidOn: string; amountCents: number }>;
};

export type StatementRow = {
  invoiceId: string;
  jobId: string;
  jobDescription: string;
  docNumber: string;
  kind: InvoiceKind;
  kindLabel: string;
  issuedOn: string;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  creditedCents: number;
  retentionHeldCents: number;
  remainingCents: number;
  payState: InvoicePayState;
  overdue: boolean;
  age: AgeBucket | null;
};

export function statementRows(
  invoices: StatementInvoiceInput[],
  asAt: string,
  from: string | null,
): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const invoice of invoices) {
    if (
      !invoiceOnStatement({
        status: invoice.status,
        dueDate: invoice.dueDate,
        paymentTermsDays: invoice.paymentTermsDays,
        asAt,
        from,
      })
    ) {
      continue;
    }
    const paidCents = paidCentsAsAt(invoice.payments, asAt);
    const { remainingCents, payState } = invoiceSettlement({
      invoiceTotalCents: invoice.totalCents,
      paidCents,
      creditedCents: invoice.creditedCents,
      retentionHeldCents: invoice.retentionHeldCents,
    });
    const issuedOn =
      invoiceIssuedOn(invoice.dueDate, invoice.paymentTermsDays) ?? invoice.dueDate;
    rows.push({
      invoiceId: invoice.id,
      jobId: invoice.jobId,
      jobDescription: invoice.jobDescription,
      docNumber: invoice.docNumber,
      kind: parseInvoiceKind(invoice.kind),
      kindLabel: invoiceKindLabel(parseInvoiceKind(invoice.kind)),
      issuedOn,
      dueDate: invoice.dueDate,
      totalCents: invoice.totalCents,
      paidCents,
      creditedCents: invoice.creditedCents,
      retentionHeldCents: invoice.retentionHeldCents,
      remainingCents,
      payState,
      overdue: invoiceIsOverdue({
        status: invoice.status,
        dueDate: invoice.dueDate,
        remainingCents,
        today: asAt,
      }),
      age: ageBucket({
        dueDate: invoice.dueDate,
        remainingCents,
        asAt,
      }),
    });
  }
  return rows.sort(
    (a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.docNumber.localeCompare(b.docNumber),
  );
}

export type StatementTotals = {
  billedCents: number;
  paidCents: number;
  creditedCents: number;
  retentionHeldCents: number;
  remainingCents: number;
  currentCents: number;
  days1to30Cents: number;
  days31to60Cents: number;
  days61to90Cents: number;
  days90plusCents: number;
};

export function statementTotals(rows: StatementRow[]): StatementTotals {
  const totals: StatementTotals = {
    billedCents: 0,
    paidCents: 0,
    creditedCents: 0,
    retentionHeldCents: 0,
    remainingCents: 0,
    currentCents: 0,
    days1to30Cents: 0,
    days31to60Cents: 0,
    days61to90Cents: 0,
    days90plusCents: 0,
  };
  for (const row of rows) {
    totals.billedCents += row.totalCents;
    totals.paidCents += row.paidCents;
    totals.creditedCents += row.creditedCents;
    totals.retentionHeldCents += row.retentionHeldCents;
    totals.remainingCents += row.remainingCents;
    if (row.age === "current") {
      totals.currentCents += row.remainingCents;
    } else if (row.age === "days1to30") {
      totals.days1to30Cents += row.remainingCents;
    } else if (row.age === "days31to60") {
      totals.days31to60Cents += row.remainingCents;
    } else if (row.age === "days61to90") {
      totals.days61to90Cents += row.remainingCents;
    } else if (row.age === "days90plus") {
      totals.days90plusCents += row.remainingCents;
    }
  }
  return totals;
}

export function paymentMethodLabel(raw: string | null | undefined): string {
  const normalised = (raw ?? "").trim().toLowerCase();
  if (normalised === "cash") {
    return "Cash";
  }
  if (normalised === "card") {
    return "Card";
  }
  if (normalised === "transfer") {
    return "Transfer";
  }
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? "Payment" : trimmed;
}

export type RemittanceAdvice = {
  paidOn: string;
  methodLabel: string;
  amountCents: number;
  invoiceDocNumber: string;
  invoiceTotalCents: number;
  recordedCents: number;
  creditedCents: number;
  retentionHeldCents: number;
  remainingCents: number;
};

export function remittanceAdvice(input: {
  paidOn: string;
  method: string;
  amountCents: number;
  invoiceDocNumber: string;
  invoiceTotalCents: number;
  creditedCents: number;
  retentionHeldCents: number;
  payments: Array<{ paidOn: string; amountCents: number }>;
}): RemittanceAdvice {
  const recordedCents = input.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const { remainingCents } = invoiceSettlement({
    invoiceTotalCents: input.invoiceTotalCents,
    paidCents: recordedCents,
    creditedCents: input.creditedCents,
    retentionHeldCents: input.retentionHeldCents,
  });
  return {
    paidOn: input.paidOn,
    methodLabel: paymentMethodLabel(input.method),
    amountCents: input.amountCents,
    invoiceDocNumber: input.invoiceDocNumber,
    invoiceTotalCents: input.invoiceTotalCents,
    recordedCents,
    creditedCents: input.creditedCents,
    retentionHeldCents: input.retentionHeldCents,
    remainingCents,
  };
}
