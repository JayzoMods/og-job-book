import { dollarsToCents, parseAudAmount } from "./money";
import {
  parseAmountKind,
  parseLineUnit,
  parseTaxCode,
  type AmountKind,
  type LineUnit,
  type TaxCode,
} from "./tax";

const DESCRIPTION_MAX = 120;

/** Empty, whitespace-only, and over 120 characters → null. */
export function parseRateDescription(raw: string | number | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "" || trimmed.length > DESCRIPTION_MAX) {
    return null;
  }
  return trimmed;
}

/** Empty, junk, zero, and negative → null. Sell price only — not cost. */
export function parseRatePriceCents(raw: string | number | null | undefined): number | null {
  const dollars =
    typeof raw === "number"
      ? Number.isFinite(raw)
        ? raw
        : null
      : parseAudAmount(String(raw ?? ""));
  if (dollars === null || dollars <= 0) {
    return null;
  }
  const cents = dollarsToCents(dollars);
  if (cents <= 0) {
    return null;
  }
  return cents;
}

export type RateCardLine = {
  description: string;
  quantity: number;
  unit: LineUnit;
  unitPriceCents: number;
  unitCostCents: number | null;
  taxCode: TaxCode;
  amountKind: AmountKind;
  sortOrder: number;
};

export function rateItemToLine(
  item: {
    description: string;
    unit: string;
    unitPriceCents: number;
    unitCostCents?: number | null;
    taxCode: string;
    amountKind: string;
  },
  sortOrder: number,
): RateCardLine | null {
  const description = parseRateDescription(item.description);
  const taxCode = parseTaxCode(item.taxCode);
  if (!description || taxCode === null || item.unitPriceCents <= 0) {
    return null;
  }
  const cost = item.unitCostCents;
  return {
    description,
    quantity: 1,
    unit: parseLineUnit(item.unit),
    unitPriceCents: item.unitPriceCents,
    unitCostCents: cost !== null && cost !== undefined && cost > 0 ? cost : null,
    taxCode,
    amountKind: parseAmountKind(item.amountKind),
    sortOrder,
  };
}

/** Rate-card lines first (qty 1), then typed lines. Empty either side is fine. */
export function mergeRateAndTypedLines<
  T extends {
    description: string;
    quantity: number;
    unit: string;
    unitPriceCents: number;
    taxCode: string;
    amountKind: string;
  },
>(rateLines: T[], typedLines: T[]): Array<T & { sortOrder: number }> {
  return [...rateLines, ...typedLines].map((line, index) => ({
    ...line,
    sortOrder: index,
  }));
}
