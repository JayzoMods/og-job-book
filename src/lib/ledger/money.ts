/** Nearest-cent rounding used for GST 1/11 checks. Not ATO software. */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function gstFromInclusive(totalInclusive: number): number {
  return roundCents(totalInclusive / 11);
}

export function gstFromExclusive(exclusive: number): number {
  return roundCents(exclusive * 0.1);
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function gstCentsFromInclusive(totalInclusiveCents: number): number {
  return Math.round(totalInclusiveCents / 11);
}

export function gstCentsFromExclusive(exclusiveCents: number): number {
  return Math.round(exclusiveCents * 0.1);
}

export function lineAmountCents(quantity: number, unitPriceCents: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPriceCents)) {
    return 0;
  }
  return Math.round(quantity * unitPriceCents);
}

export function parseAudAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (trimmed === "") {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return null;
  }
  return roundCents(n);
}

export function formatAudFromCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(centsToDollars(cents));
}
