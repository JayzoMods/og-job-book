import { formatAudFromCents, lineAmountCents } from "./money";
import { parseRatePriceCents } from "./rate-card";

export type CostParse = { ok: true; cents: number | null } | { ok: false };

/**
 * Empty is allowed (no cost). Junk, zero, and negative → not ok.
 * Positive AUD → cents. Cost is what you pay — not GST and not printed.
 */
export function parseCostCents(raw: string | number | null | undefined): CostParse {
  if (raw === null || raw === undefined) {
    return { ok: true, cents: null };
  }
  if (typeof raw === "string" && raw.trim() === "") {
    return { ok: true, cents: null };
  }
  const cents = parseRatePriceCents(raw);
  if (cents === null) {
    return { ok: false };
  }
  return { ok: true, cents };
}

/** Markup on cost: (sell − cost) / cost × 100, nearest 0.1. Null if there is no cost. */
export function markupPercent(
  sellCents: number,
  costCents: number | null | undefined,
): number | null {
  if (costCents === null || costCents === undefined || costCents <= 0) {
    return null;
  }
  if (!Number.isFinite(sellCents)) {
    return null;
  }
  return Math.round(((sellCents - costCents) / costCents) * 1000) / 10;
}

export function formatMarkupPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

export function lineCostCents(
  quantity: number,
  unitCostCents: number | null | undefined,
): number | null {
  if (unitCostCents === null || unitCostCents === undefined || unitCostCents <= 0) {
    return null;
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  return Math.round(quantity * unitCostCents);
}

export function unitMarkupText(
  sellCents: number,
  costCents: number | null | undefined,
): string | null {
  const percent = markupPercent(sellCents, costCents);
  if (percent === null || costCents === null || costCents === undefined) {
    return null;
  }
  return `Cost ${formatAudFromCents(costCents)} · markup ${formatMarkupPercent(percent)}`;
}

export type MarkupLine = {
  quantity: number;
  unitPriceCents: number;
  unitCostCents?: number | null;
};

/** Only lines with a cost. Sell on those lines vs their cost. */
export function markupTotals(lines: MarkupLine[]): {
  costCents: number;
  sellCents: number;
  percent: number | null;
  lineCount: number;
} {
  let costCents = 0;
  let sellCents = 0;
  let lineCount = 0;
  for (const line of lines) {
    const cost = lineCostCents(line.quantity, line.unitCostCents);
    if (cost === null) {
      continue;
    }
    lineCount += 1;
    costCents += cost;
    sellCents += lineAmountCents(line.quantity, line.unitPriceCents);
  }
  return {
    costCents,
    sellCents,
    percent: lineCount === 0 ? null : markupPercent(sellCents, costCents),
    lineCount,
  };
}

export function markupNoteText(lines: MarkupLine[]): string | null {
  const totals = markupTotals(lines);
  if (totals.percent === null) {
    return null;
  }
  return `Internal — not printed. Cost ${formatAudFromCents(totals.costCents)} · sell ${formatAudFromCents(totals.sellCents)} · markup ${formatMarkupPercent(totals.percent)}. Not tax advice.`;
}
