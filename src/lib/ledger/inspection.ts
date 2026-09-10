export const REPORT_TYPES = [
  "pre_purchase",
  "pest",
  "building_pest",
  "roof",
  "safety",
  "storm",
  "other",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

const PROPERTY_MAX = 200;
const PARTY_MAX = 120;

const REPORT_TYPE_SET = new Set<string>(REPORT_TYPES);

const REPORT_TYPE_ALIASES: Record<string, ReportType> = {
  pre_purchase: "pre_purchase",
  prepurchase: "pre_purchase",
  "pre-purchase": "pre_purchase",
  building: "pre_purchase",
  pest: "pest",
  timber_pest: "pest",
  "timber-pest": "pest",
  building_pest: "building_pest",
  "building-pest": "building_pest",
  combined: "building_pest",
  roof: "roof",
  safety: "safety",
  annual: "safety",
  storm: "storm",
  insurance: "storm",
  other: "other",
};

function parseBoundedEmptyOk(
  raw: string | number | null | undefined,
  max: number,
): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.length > max) {
    return null;
  }
  return trimmed;
}

/** Empty is allowed. Over 200 characters → null. Site address, not the customer suburb. */
export function parsePropertyAddress(
  raw: string | number | null | undefined,
): string | null {
  return parseBoundedEmptyOk(raw, PROPERTY_MAX);
}

/** Empty is allowed. Over 120 characters → null. Vendor or purchaser name, not a customer row. */
export function parsePartyName(raw: string | number | null | undefined): string | null {
  return parseBoundedEmptyOk(raw, PARTY_MAX);
}

/**
 * Empty is allowed (not every job is an inspection). Unknown tokens → null.
 * Stored values are the closed set; a few typed aliases map in.
 */
export function parseReportType(
  raw: string | number | null | undefined,
): ReportType | "" | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return "";
  }
  const normalised = trimmed.toLowerCase().replace(/[\s]+/g, "_");
  if (REPORT_TYPE_SET.has(normalised)) {
    return normalised as ReportType;
  }
  return REPORT_TYPE_ALIASES[normalised] ?? REPORT_TYPE_ALIASES[trimmed.toLowerCase()] ?? null;
}

export function reportTypeLabel(type: string | null | undefined): string {
  switch (parseReportType(type) || "") {
    case "pre_purchase":
      return "Pre-purchase building";
    case "pest":
      return "Pest";
    case "building_pest":
      return "Building and pest";
    case "roof":
      return "Roof";
    case "safety":
      return "Safety";
    case "storm":
      return "Storm";
    case "other":
      return "Other";
    default:
      return "";
  }
}

export const REPORT_TYPE_OPTIONS: Array<{ value: ReportType | ""; label: string }> = [
  { value: "", label: "None" },
  ...REPORT_TYPES.map((value) => ({ value, label: reportTypeLabel(value) })),
];

export type InspectionFields = {
  propertyAddress: string;
  vendorName: string;
  purchaserName: string;
  reportType: ReportType | "";
};

/** All four empty is valid. Any field over the cap, or a junk report type, → null. */
export function parseInspectionFields(input: {
  propertyAddress?: string | number | null;
  vendorName?: string | number | null;
  purchaserName?: string | number | null;
  reportType?: string | number | null;
}): InspectionFields | null {
  const propertyAddress = parsePropertyAddress(input.propertyAddress);
  const vendorName = parsePartyName(input.vendorName);
  const purchaserName = parsePartyName(input.purchaserName);
  const reportType = parseReportType(input.reportType);
  if (
    propertyAddress === null ||
    vendorName === null ||
    purchaserName === null ||
    reportType === null
  ) {
    return null;
  }
  return { propertyAddress, vendorName, purchaserName, reportType };
}

export type InspectionPrintLine = { label: string; value: string };

/** Empty fields are omitted. Job notes never belong here. */
export function inspectionPrintLines(
  fields: InspectionFields | {
    propertyAddress: string;
    vendorName: string;
    purchaserName: string;
    reportType: string;
  },
): InspectionPrintLine[] {
  const lines: InspectionPrintLine[] = [];
  const property = fields.propertyAddress.trim();
  const report = reportTypeLabel(fields.reportType);
  const vendor = fields.vendorName.trim();
  const purchaser = fields.purchaserName.trim();
  if (property) {
    lines.push({ label: "Property", value: property });
  }
  if (report) {
    lines.push({ label: "Report", value: report });
  }
  if (vendor) {
    lines.push({ label: "Vendor", value: vendor });
  }
  if (purchaser) {
    lines.push({ label: "Purchaser", value: purchaser });
  }
  return lines;
}
