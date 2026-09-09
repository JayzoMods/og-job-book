import {
  formatAudFromCents,
  gstCentsFromExclusive,
  gstCentsFromInclusive,
  lineAmountCents,
} from "./money";

export const TAX_CODES = [
  "GST",
  "GST_FREE",
  "BAS_EXCLUDED",
  "INPUT_TAXED",
] as const;

export type TaxCode = (typeof TAX_CODES)[number];

export const AMOUNT_KINDS = ["inclusive", "exclusive"] as const;

export type AmountKind = (typeof AMOUNT_KINDS)[number];

export const JOB_STATUSES = [
  "enquiry",
  "quoted",
  "accepted",
  "invoiced",
  "paid",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "superseded",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ["cash", "transfer", "card"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const TAX_CODE_SET = new Set<string>(TAX_CODES);
const AMOUNT_KIND_SET = new Set<string>(AMOUNT_KINDS);

export function parseTaxCode(raw: string): TaxCode | null {
  const normalised = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (TAX_CODE_SET.has(normalised)) {
    return normalised as TaxCode;
  }
  if (normalised === "FRE") {
    return "GST_FREE";
  }
  return null;
}

export function parseAmountKind(raw: string): AmountKind {
  const normalised = raw.trim().toLowerCase();
  return AMOUNT_KIND_SET.has(normalised) ? (normalised as AmountKind) : "inclusive";
}

export const LINE_UNITS = ["each", "hours", "m2"] as const;

export type LineUnit = (typeof LINE_UNITS)[number];

export function parseLineUnit(raw: string | null | undefined): LineUnit {
  const normalised = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/\s+/g, "");
  if (
    normalised === "hours" ||
    normalised === "hour" ||
    normalised === "hr" ||
    normalised === "hrs"
  ) {
    return "hours";
  }
  if (
    normalised === "m2" ||
    normalised === "m^2" ||
    normalised === "sqm" ||
    normalised === "sq.m" ||
    normalised === "squaremetre" ||
    normalised === "squaremetres"
  ) {
    return "m2";
  }
  return "each";
}

export function lineUnitLabel(unit: LineUnit): string {
  return unit === "m2" ? "m²" : unit;
}

export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) {
    return "";
  }
  return String(Number(quantity.toFixed(3)));
}

export function formatLineQuantity(quantity: number, unit: LineUnit): string {
  return `${formatQuantity(quantity)} ${lineUnitLabel(unit)}`;
}

export type LineInput = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  unit?: LineUnit;
  taxCode: TaxCode;
  amountKind: AmountKind;
  /** If set, compared to expected GST. UI omits this and uses the computed amount. */
  gstAmountCents?: number | null;
};

export type LineFlag = {
  code: string;
  message: string;
};

export type ComputedLine = {
  description: string;
  quantity: number;
  unit: LineUnit;
  unitPriceCents: number;
  taxCode: TaxCode;
  amountKind: AmountKind;
  amountCents: number;
  expectedGstCents: number;
  gstCents: number;
  gstFreeCents: number;
  otherCents: number;
  totalCents: number;
  flags: LineFlag[];
};

export type DocumentTotals = {
  gstCents: number;
  gstFreeCents: number;
  otherCents: number;
  totalCents: number;
  flags: LineFlag[];
  lines: ComputedLine[];
};

function expectedGstForLine(
  taxCode: TaxCode,
  amountKind: AmountKind,
  amountCents: number,
): number {
  if (taxCode !== "GST") {
    return 0;
  }
  return amountKind === "exclusive"
    ? gstCentsFromExclusive(amountCents)
    : gstCentsFromInclusive(amountCents);
}

export function computeLine(line: LineInput, gstRegistered = true): ComputedLine {
  const unit = parseLineUnit(line.unit);
  const amountCents = lineAmountCents(line.quantity, line.unitPriceCents);
  const expectedGstCents = expectedGstForLine(
    line.taxCode,
    line.amountKind,
    amountCents,
  );
  const recordedGstCents =
    line.gstAmountCents === undefined || line.gstAmountCents === null
      ? expectedGstCents
      : line.gstAmountCents;
  const gstCents = gstRegistered ? recordedGstCents : 0;

  const flags: LineFlag[] = [];

  if (
    (line.taxCode === "GST_FREE" ||
      line.taxCode === "BAS_EXCLUDED" ||
      line.taxCode === "INPUT_TAXED") &&
    recordedGstCents !== 0
  ) {
    flags.push({
      code: "gst_on_non_taxable",
      message: `Coded ${line.taxCode.replaceAll("_", " ")} but GST of ${formatFlagMoney(recordedGstCents)} is recorded.`,
    });
  }

  if (
    gstRegistered &&
    line.taxCode === "GST" &&
    recordedGstCents !== expectedGstCents
  ) {
    const rule =
      line.amountKind === "exclusive" ? "10% exclusive" : "1/11 inclusive";
    flags.push({
      code: "gst_math_mismatch",
      message: `GST on the line is ${formatFlagMoney(recordedGstCents)}; ${rule} is ${formatFlagMoney(expectedGstCents)}.`,
    });
  }

  if (!gstRegistered && line.taxCode === "GST") {
    flags.push({
      code: "gst_when_not_registered",
      message:
        "This organisation is not GST registered, so GST is not charged on this line.",
    });
  }

  const gstFreeCents = line.taxCode === "GST_FREE" ? amountCents : 0;
  const otherCents =
    line.taxCode === "BAS_EXCLUDED" || line.taxCode === "INPUT_TAXED"
      ? amountCents
      : 0;
  const totalCents =
    gstRegistered && line.taxCode === "GST" && line.amountKind === "exclusive"
      ? amountCents + expectedGstCents
      : amountCents;

  return {
    description: line.description,
    quantity: line.quantity,
    unit,
    unitPriceCents: line.unitPriceCents,
    taxCode: line.taxCode,
    amountKind: line.amountKind,
    amountCents,
    expectedGstCents,
    gstCents,
    gstFreeCents,
    otherCents,
    totalCents,
    flags,
  };
}

export function computeDocument(
  lines: LineInput[],
  gstRegistered = true,
): DocumentTotals {
  const computed = lines.map((line) => computeLine(line, gstRegistered));
  return {
    gstCents: computed.reduce((sum, line) => sum + line.gstCents, 0),
    gstFreeCents: computed.reduce((sum, line) => sum + line.gstFreeCents, 0),
    otherCents: computed.reduce((sum, line) => sum + line.otherCents, 0),
    totalCents: computed.reduce((sum, line) => sum + line.totalCents, 0),
    flags: computed.flatMap((line) => line.flags),
    lines: computed,
  };
}

/** Visible 1/11 or 10% check on a GST line. Null for GST-free / other codes. */
export function gstProofLabel(line: {
  taxCode: TaxCode;
  amountKind: AmountKind;
  expectedGstCents: number;
}): string | null {
  if (line.taxCode !== "GST") {
    return null;
  }
  const rule = line.amountKind === "exclusive" ? "10%" : "1/11";
  return `${rule} ${formatAudFromCents(line.expectedGstCents)}`;
}

function formatFlagMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function taxCodeLabel(code: TaxCode): string {
  switch (code) {
    case "GST":
      return "GST";
    case "GST_FREE":
      return "GST-free";
    case "BAS_EXCLUDED":
      return "BAS excluded";
    case "INPUT_TAXED":
      return "Input-taxed";
  }
}

export function todayIsoSydney(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  const next = new Date(utc);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
