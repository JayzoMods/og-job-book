const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatAbn(digits: string): string {
  const clean = digitsOnly(digits);
  if (clean.length !== 11) {
    return digits;
  }
  return `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
}

/**
 * ABR modulus-89 check.
 * Source: https://abr.business.gov.au/Help/AbnFormat opened 6 Sep 2026.
 */
export function isValidAbn(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 11) {
    return false;
  }
  const first = Number(digits[0]);
  if (first < 1) {
    return false;
  }
  const adjusted = [first - 1, ...digits.slice(1).split("").map(Number)];
  const sum = adjusted.reduce(
    (total, digit, index) => total + digit * ABN_WEIGHTS[index],
    0,
  );
  return sum % 89 === 0;
}
