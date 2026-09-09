const PHONE_MAX = 40;
const EMAIL_MAX = 80;
const NOTES_MAX = 2000;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitCount(raw: string): number {
  return raw.replace(/\D/g, "").length;
}

/**
 * Empty is allowed. Junk (too long, or fewer than 8 digits) → null.
 * Display stays as typed. Not a live check and not Confirmation of Payee.
 */
export function parsePhone(raw: string | number | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return "";
  }
  if (trimmed.length > PHONE_MAX) {
    return null;
  }
  const digits = digitCount(trimmed);
  if (digits < 8 || digits > 15) {
    return null;
  }
  return trimmed;
}

/**
 * Empty is allowed. Non-empty must look like local-part@domain.tld.
 * Not MX lookup, not a send, not Confirmation of Payee.
 */
export function parseEmail(raw: string | number | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return "";
  }
  if (trimmed.length > EMAIL_MAX) {
    return null;
  }
  if (!EMAIL_SHAPE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Empty is allowed. Over 2,000 characters → null. */
export function parseJobNotes(raw: string | number | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.length > NOTES_MAX) {
    return null;
  }
  return trimmed;
}
