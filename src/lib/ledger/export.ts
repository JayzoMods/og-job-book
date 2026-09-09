import { parseIsoDate } from "./terms";
import { invoiceIssuedOn, invoiceOnStatement } from "./statement";
import { formatLineQuantity, parseLineUnit, type ComputedLine } from "./tax";

export const EXPORT_FORMATS = ["json", "csv", "bas-check"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const FORMAT_ALIASES: Record<string, ExportFormat> = {
  json: "json",
  csv: "csv",
  "bas-check": "bas-check",
  bas_check: "bas-check",
  bascheck: "bas-check",
};

/** Empty and junk → null. Do not guess a format. */
export function parseExportFormat(raw: string | null | undefined): ExportFormat | null {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return FORMAT_ALIASES[key] ?? null;
}

export function csvAmountFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(",");
}

export function exportFilename(format: ExportFormat, asAt: string): string {
  if (format === "json") {
    return `og-job-book-${asAt}.json`;
  }
  if (format === "csv") {
    return `og-job-book-${asAt}.csv`;
  }
  return `og-job-book-bas-check-${asAt}.csv`;
}

export type ExportDocKind = "quote" | "invoice" | "credit";

export type ExportLineRow = {
  kind: ExportDocKind;
  docNumber: string;
  status: string;
  date: string;
  customerName: string;
  suburb: string;
  jobDescription: string;
  lineDescription: string;
  quantity: number;
  unit: string;
  taxCode: string;
  amountKind: string;
  amountCents: number;
  gstCents: number;
  totalCents: number;
};

function signedLine(line: ComputedLine, sign: 1 | -1): Pick<
  ExportLineRow,
  "lineDescription" | "quantity" | "unit" | "taxCode" | "amountKind" | "amountCents" | "gstCents" | "totalCents"
> {
  return {
    lineDescription: line.description,
    quantity: line.quantity,
    unit: line.unit,
    taxCode: line.taxCode,
    amountKind: line.amountKind,
    amountCents: sign * line.amountCents,
    gstCents: sign * line.gstCents,
    totalCents: sign * line.totalCents,
  };
}

function basCheckAmountCents(row: ExportLineRow): number {
  return row.amountKind === "exclusive" ? row.amountCents : row.totalCents;
}

export function invoiceBelongsInExport(input: {
  status: string;
  dueDate: string;
  paymentTermsDays: number;
  asAt: string;
  from: string | null;
}): boolean {
  return invoiceOnStatement(input);
}

export function paymentBelongsInExport(
  paidOn: string,
  asAt: string,
  from: string | null,
): boolean {
  const on = parseIsoDate(paidOn);
  if (!on) {
    return false;
  }
  if (on > asAt) {
    return false;
  }
  if (from && on < from) {
    return false;
  }
  return true;
}

export function invoiceExportRows(input: {
  docNumber: string;
  status: string;
  dueDate: string;
  paymentTermsDays: number;
  customerName: string;
  suburb: string;
  jobDescription: string;
  lines: ComputedLine[];
  asAt: string;
  from: string | null;
}): ExportLineRow[] {
  if (
    !invoiceBelongsInExport({
      status: input.status,
      dueDate: input.dueDate,
      paymentTermsDays: input.paymentTermsDays,
      asAt: input.asAt,
      from: input.from,
    })
  ) {
    return [];
  }
  const date =
    invoiceIssuedOn(input.dueDate, input.paymentTermsDays) ?? input.dueDate;
  return input.lines.map((line) => ({
    kind: "invoice",
    docNumber: input.docNumber,
    status: input.status,
    date,
    customerName: input.customerName,
    suburb: input.suburb,
    jobDescription: input.jobDescription,
    ...signedLine(line, 1),
  }));
}

export function creditExportRows(input: {
  docNumber: string;
  status: string;
  invoiceStatus: string;
  invoiceDueDate: string;
  invoicePaymentTermsDays: number;
  customerName: string;
  suburb: string;
  jobDescription: string;
  lines: ComputedLine[];
  asAt: string;
  from: string | null;
}): ExportLineRow[] {
  if (input.status === "void") {
    return [];
  }
  if (
    !invoiceBelongsInExport({
      status: input.invoiceStatus,
      dueDate: input.invoiceDueDate,
      paymentTermsDays: input.invoicePaymentTermsDays,
      asAt: input.asAt,
      from: input.from,
    })
  ) {
    return [];
  }
  const date =
    invoiceIssuedOn(input.invoiceDueDate, input.invoicePaymentTermsDays) ??
    input.invoiceDueDate;
  return input.lines.map((line) => ({
    kind: "credit",
    docNumber: input.docNumber,
    status: input.status,
    date,
    customerName: input.customerName,
    suburb: input.suburb,
    jobDescription: input.jobDescription,
    ...signedLine(line, -1),
  }));
}

export function quoteExportRows(input: {
  docNumber: string;
  status: string;
  validUntil: string;
  customerName: string;
  suburb: string;
  jobDescription: string;
  lines: ComputedLine[];
}): ExportLineRow[] {
  return input.lines.map((line) => ({
    kind: "quote",
    docNumber: input.docNumber,
    status: input.status,
    date: input.validUntil,
    customerName: input.customerName,
    suburb: input.suburb,
    jobDescription: input.jobDescription,
    ...signedLine(line, 1),
  }));
}

function kindOrder(kind: ExportDocKind): number {
  if (kind === "invoice") {
    return 0;
  }
  if (kind === "credit") {
    return 1;
  }
  return 2;
}

export function sortExportRows(rows: ExportLineRow[]): ExportLineRow[] {
  return [...rows].sort((a, b) => {
    const date = a.date.localeCompare(b.date);
    if (date !== 0) {
      return date;
    }
    const kind = kindOrder(a.kind) - kindOrder(b.kind);
    if (kind !== 0) {
      return kind;
    }
    const doc = a.docNumber.localeCompare(b.docNumber);
    if (doc !== 0) {
      return doc;
    }
    return a.lineDescription.localeCompare(b.lineDescription);
  });
}

export const LEDGER_CSV_HEADER = [
  "kind",
  "doc_number",
  "status",
  "date",
  "customer",
  "suburb",
  "job",
  "description",
  "quantity",
  "tax_code",
  "amount_kind",
  "gst",
  "total",
] as const;

export const BAS_CHECK_CSV_HEADER = [
  "date",
  "description",
  "amount",
  "tax_code",
  "gst_amount",
  "amount_kind",
  "abn",
] as const;

export function toLedgerCsv(rows: ExportLineRow[]): string {
  const lines = [
    csvRow(LEDGER_CSV_HEADER),
    ...sortExportRows(rows).map((row) =>
      csvRow([
        row.kind,
        row.docNumber,
        row.status,
        row.date,
        row.customerName,
        row.suburb,
        row.jobDescription,
        row.lineDescription,
        formatLineQuantity(row.quantity, parseLineUnit(row.unit)),
        row.taxCode,
        row.amountKind,
        csvAmountFromCents(row.gstCents),
        csvAmountFromCents(row.totalCents),
      ]),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function toBasCheckCsv(rows: ExportLineRow[]): string {
  const sales = sortExportRows(rows.filter((row) => row.kind !== "quote"));
  const lines = [
    csvRow(BAS_CHECK_CSV_HEADER),
    ...sales.map((row) =>
      csvRow([
        row.date,
        `${row.docNumber} · ${row.lineDescription}`,
        csvAmountFromCents(basCheckAmountCents(row)),
        row.taxCode,
        csvAmountFromCents(row.gstCents),
        row.amountKind,
        "",
      ]),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export type LedgerJson = {
  product: string;
  disclaimer: string;
  asAt: string;
  from: string | null;
  org: {
    name: string;
    abn: string;
    gstRegistered: boolean;
    address: string;
    paymentTermsDays: number;
    retentionPercent: number;
  };
  customers: Array<{
    name: string;
    suburb: string;
    phone: string;
    email: string;
  }>;
  jobs: Array<{
    customerName: string;
    suburb: string;
    description: string;
    status: string;
  }>;
  quotes: Array<{
    docNumber: string;
    status: string;
    validUntil: string;
    customerName: string;
    gstCents: number;
    totalCents: number;
    lines: Array<{
      description: string;
      quantity: number;
      unit: string;
      unitPriceCents: number;
      taxCode: string;
      amountKind: string;
      gstCents: number;
      totalCents: number;
    }>;
  }>;
  invoices: Array<{
    docNumber: string;
    status: string;
    kind: string;
    issuedOn: string;
    dueDate: string;
    customerName: string;
    gstCents: number;
    totalCents: number;
    paidCents: number;
    creditedCents: number;
  }>;
  payments: Array<{
    invoiceDocNumber: string;
    amountCents: number;
    paidOn: string;
    method: string;
  }>;
  creditNotes: Array<{
    docNumber: string;
    status: string;
    againstDocNumber: string;
    gstCents: number;
    totalCents: number;
  }>;
};

export function toLedgerJson(input: LedgerJson): string {
  return `${JSON.stringify(input, null, 2)}\n`;
}

export const LEDGER_EXPORT_DISCLAIMER =
  "This is a bookkeeping export from OG Job Book. It is not tax advice, not a BAS, and not Confirmation of Payee. The BAS Check CSV is sales lines in BAS Check column order so you can drop the file into that app. OG Job Book does not analyse GST coding risk, look up a bulk ABN list, or lodge with the ATO.";
