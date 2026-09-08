/** Human-readable quote/invoice/credit numbers. Seq is 1-based after allocate. */
export function formatDocNumber(prefix: "Q" | "INV" | "CN", seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error("Document sequence must be an integer of 1 or more.");
  }
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}
