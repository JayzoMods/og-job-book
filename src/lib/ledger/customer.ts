const NAME_MAX = 120;
const SUBURB_MAX = 80;

function parseBounded(raw: string | number | null | undefined, max: number): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "" || trimmed.length > max) {
    return null;
  }
  return trimmed;
}

/** Empty, whitespace-only, and over 120 characters → null. */
export function parseCustomerName(raw: string | number | null | undefined): string | null {
  return parseBounded(raw, NAME_MAX);
}

/** Empty, whitespace-only, and over 80 characters → null. */
export function parseSuburb(raw: string | number | null | undefined): string | null {
  return parseBounded(raw, SUBURB_MAX);
}
