export type InvoicePayDetails = {
  accountName: string;
  bsb: string;
  accountNumber: string;
  payId: string;
};

/** Six digits after stripping punctuation. Anything else is empty (not shown). */
export function parseBsb(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 6 ? digits : "";
}

export function formatBsb(raw: string | null | undefined): string {
  const bsb = parseBsb(raw);
  if (!bsb) {
    return "";
  }
  return `${bsb.slice(0, 3)}-${bsb.slice(3)}`;
}

/** 4–10 digits. Empty and junk are empty. */
export function parseAccountNumber(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 4 || digits.length > 10) {
    return "";
  }
  return digits;
}

export function parsePayId(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, 80);
}

export function parseAccountName(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, 120);
}

export function invoicePayDetails(input: {
  accountName?: string | null;
  bsb?: string | null;
  accountNumber?: string | null;
  payId?: string | null;
}): InvoicePayDetails {
  return {
    accountName: parseAccountName(input.accountName),
    bsb: parseBsb(input.bsb),
    accountNumber: parseAccountNumber(input.accountNumber),
    payId: parsePayId(input.payId),
  };
}

/** Need PayID, BSB, or account number. Account name alone is not a payment instruction. */
export function hasInvoicePayDetails(details: InvoicePayDetails): boolean {
  return details.payId !== "" || details.bsb !== "" || details.accountNumber !== "";
}

export function invoicePayLines(
  details: InvoicePayDetails,
): Array<{ label: string; value: string }> {
  if (!hasInvoicePayDetails(details)) {
    return [];
  }
  const lines: Array<{ label: string; value: string }> = [];
  if (details.accountName) {
    lines.push({ label: "Account name", value: details.accountName });
  }
  if (details.bsb) {
    lines.push({ label: "BSB", value: formatBsb(details.bsb) });
  }
  if (details.accountNumber) {
    lines.push({ label: "Account", value: details.accountNumber });
  }
  if (details.payId) {
    lines.push({ label: "PayID", value: details.payId });
  }
  return lines;
}
