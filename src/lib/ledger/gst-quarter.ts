import { invoiceKindLabel, parseInvoiceKind } from "./claim";
import { invoiceIssuedOn, invoiceOnStatement } from "./statement";
import { parseIsoDate } from "./terms";

export const GST_QUARTER_DISCLAIMER =
  "This is a GST quarter report from OG Job Book. It is not a BAS, not tax advice, and we do not lodge with the ATO. Figures are by invoice date (due minus payment terms), not cash received. Quotes are not included. Void and draft invoices are not included. Credit notes reduce sales and GST. Retention is a hold, not a GST adjustment. Amounts are AUD.";

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type GstQuarterOk = {
  ok: true;
  from: string;
  to: string;
  value: string;
  label: string;
};

export type GstQuarter = GstQuarterOk | { ok: false };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function quarterStartMonth(month: number): 1 | 4 | 7 | 10 {
  if (month <= 3) {
    return 1;
  }
  if (month <= 6) {
    return 4;
  }
  if (month <= 9) {
    return 7;
  }
  return 10;
}

function gstQuarterBounds(
  year: number,
  startMonth: 1 | 4 | 7 | 10,
): { from: string; to: string } {
  const from = `${year}-${pad2(startMonth)}-01`;
  if (startMonth === 1) {
    return { from, to: `${year}-03-31` };
  }
  if (startMonth === 4) {
    return { from, to: `${year}-06-30` };
  }
  if (startMonth === 7) {
    return { from, to: `${year}-09-30` };
  }
  return { from, to: `${year}-12-31` };
}

export function gstQuarterLabel(from: string, to: string): string {
  const fromMonth = Number(from.slice(5, 7));
  const toMonth = Number(to.slice(5, 7));
  const year = from.slice(0, 4);
  const start = MONTH_SHORT[fromMonth - 1] ?? from;
  const end = MONTH_SHORT[toMonth - 1] ?? to;
  return `${start}–${end} ${year}`;
}

function quarterFromYearMonth(year: number, month: number): GstQuarterOk | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  const startMonth = quarterStartMonth(month);
  const { from, to } = gstQuarterBounds(year, startMonth);
  return {
    ok: true,
    from,
    to,
    value: `${year}-${pad2(startMonth)}`,
    label: gstQuarterLabel(from, to),
  };
}

/** Empty → quarter containing today. YYYY-MM or a calendar day snaps to that ATO quarter. Junk → reject. */
export function parseGstQuarter(
  raw: string | null | undefined,
  today: string,
): GstQuarter {
  const trimmed = String(raw ?? "").trim();
  const source = trimmed === "" ? today : trimmed;
  const ym = /^(\d{4})-(\d{2})$/.exec(source);
  if (ym) {
    const parsed = quarterFromYearMonth(Number(ym[1]), Number(ym[2]));
    return parsed ?? { ok: false };
  }
  const date = parseIsoDate(source);
  if (!date) {
    return { ok: false };
  }
  const [year, month] = date.split("-").map(Number);
  const parsed = quarterFromYearMonth(year, month);
  return parsed ?? { ok: false };
}

export function gstQuarterChoices(
  today: string,
  pastCount = 8,
): Array<{ value: string; label: string }> {
  const current = parseGstQuarter("", today);
  if (!current.ok) {
    return [];
  }
  const [year, month] = current.value.split("-").map(Number);
  const choices: Array<{ value: string; label: string }> = [];
  let y = year;
  let m = month;
  const n = Math.max(0, Math.trunc(pastCount));
  for (let i = 0; i <= n; i += 1) {
    const bounds = gstQuarterBounds(y, quarterStartMonth(m));
    choices.push({
      value: `${y}-${pad2(quarterStartMonth(m))}`,
      label: gstQuarterLabel(bounds.from, bounds.to),
    });
    m -= 3;
    if (m < 1) {
      m += 12;
      y -= 1;
    }
  }
  return choices;
}

export type GstQuarterDocInput = {
  status: string;
  dueDate: string;
  paymentTermsDays: number;
  kind: string;
  docNumber: string;
  customerName: string;
  jobDescription: string;
  gstCents: number;
  gstFreeCents: number;
  otherCents: number;
  totalCents: number;
  creditNotes: Array<{
    status: string;
    docNumber: string;
    gstCents: number;
    gstFreeCents: number;
    otherCents: number;
    totalCents: number;
  }>;
};

export type GstQuarterRow = {
  kind: "invoice" | "credit";
  kindLabel: string;
  docNumber: string;
  issuedOn: string;
  customerName: string;
  jobDescription: string;
  gstCents: number;
  gstFreeCents: number;
  otherCents: number;
  totalCents: number;
};

function kindOrder(kind: GstQuarterRow["kind"]): number {
  return kind === "invoice" ? 0 : 1;
}

function negateCents(cents: number): number {
  return cents === 0 ? 0 : -cents;
}

export function gstQuarterRows(
  docs: GstQuarterDocInput[],
  from: string,
  to: string,
): GstQuarterRow[] {
  const rows: GstQuarterRow[] = [];
  for (const doc of docs) {
    if (
      !invoiceOnStatement({
        status: doc.status,
        dueDate: doc.dueDate,
        paymentTermsDays: doc.paymentTermsDays,
        asAt: to,
        from,
      })
    ) {
      continue;
    }
    const issuedOn = invoiceIssuedOn(doc.dueDate, doc.paymentTermsDays) ?? doc.dueDate;
    rows.push({
      kind: "invoice",
      kindLabel: invoiceKindLabel(parseInvoiceKind(doc.kind)),
      docNumber: doc.docNumber,
      issuedOn,
      customerName: doc.customerName,
      jobDescription: doc.jobDescription,
      gstCents: doc.gstCents,
      gstFreeCents: doc.gstFreeCents,
      otherCents: doc.otherCents,
      totalCents: doc.totalCents,
    });
    for (const note of doc.creditNotes) {
      if (note.status === "void") {
        continue;
      }
      rows.push({
        kind: "credit",
        kindLabel: "Credit note",
        docNumber: note.docNumber,
        issuedOn,
        customerName: doc.customerName,
        jobDescription: doc.jobDescription,
        gstCents: negateCents(note.gstCents),
        gstFreeCents: negateCents(note.gstFreeCents),
        otherCents: negateCents(note.otherCents),
        totalCents: negateCents(note.totalCents),
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.issuedOn.localeCompare(b.issuedOn) ||
      kindOrder(a.kind) - kindOrder(b.kind) ||
      a.docNumber.localeCompare(b.docNumber),
  );
}

export type GstQuarterTotals = {
  gstCents: number;
  gstFreeCents: number;
  otherCents: number;
  totalCents: number;
};

export function gstQuarterTotals(rows: GstQuarterRow[]): GstQuarterTotals {
  return rows.reduce<GstQuarterTotals>(
    (sum, row) => ({
      gstCents: sum.gstCents + row.gstCents,
      gstFreeCents: sum.gstFreeCents + row.gstFreeCents,
      otherCents: sum.otherCents + row.otherCents,
      totalCents: sum.totalCents + row.totalCents,
    }),
    { gstCents: 0, gstFreeCents: 0, otherCents: 0, totalCents: 0 },
  );
}
