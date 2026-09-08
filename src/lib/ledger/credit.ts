export const CREDIT_STATUSES = ["issued", "void"] as const;

export type CreditStatus = (typeof CREDIT_STATUSES)[number];

export type InvoicePayState = "unpaid" | "partial" | "paid" | "credited";

const CREDIT_REASON_MAX = 200;

/** Trimmed; empty is allowed. Longer text is cut at 200 characters. */
export function parseCreditReason(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, CREDIT_REASON_MAX);
}

export function creditedCentsFromNotes(
  notes: Array<{ status: string; totalCents: number }>,
): number {
  return notes
    .filter((note) => note.status !== "void")
    .reduce((sum, note) => sum + note.totalCents, 0);
}

export function invoiceBalanceCents(
  invoiceTotalCents: number,
  paidCents: number,
  creditedCents: number,
): number {
  return Math.max(0, invoiceTotalCents - paidCents - creditedCents);
}

export function creditExceedsBalance(
  creditTotalCents: number,
  balanceCents: number,
): boolean {
  return creditTotalCents > balanceCents;
}

export function invoicePayState(input: {
  paidCents: number;
  remainingCents: number;
  creditedCents: number;
}): InvoicePayState {
  if (input.remainingCents <= 0) {
    if (input.paidCents <= 0 && input.creditedCents > 0) {
      return "credited";
    }
    return "paid";
  }
  if (input.paidCents <= 0) {
    return "unpaid";
  }
  return "partial";
}

export function invoiceSettlement(input: {
  invoiceTotalCents: number;
  paidCents: number;
  creditedCents: number;
}): { remainingCents: number; payState: InvoicePayState } {
  const remainingCents = invoiceBalanceCents(
    input.invoiceTotalCents,
    input.paidCents,
    input.creditedCents,
  );
  return {
    remainingCents,
    payState: invoicePayState({
      paidCents: input.paidCents,
      remainingCents,
      creditedCents: input.creditedCents,
    }),
  };
}
