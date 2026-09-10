/** Duplicate a job shell. Quotes and invoices stay on the original. */
export function duplicateJobFields(job: {
  id: string;
  customerId: string;
  description: string;
  notes: string;
  propertyAddress: string;
  vendorName: string;
  purchaserName: string;
  reportType: string;
}): {
  customerId: string;
  description: string;
  notes: string;
  propertyAddress: string;
  vendorName: string;
  purchaserName: string;
  reportType: string;
  status: "enquiry";
  duplicatedFromJobId: string;
} {
  return {
    customerId: job.customerId,
    description: job.description,
    notes: job.notes,
    propertyAddress: job.propertyAddress,
    vendorName: job.vendorName,
    purchaserName: job.purchaserName,
    reportType: job.reportType,
    status: "enquiry",
    duplicatedFromJobId: job.id,
  };
}

/** Non-void invoices on this quote, including variations. Empty list → 0. */
export function liveInvoiceCountOnQuote(
  invoices: Array<{ quoteId: string | null; status: string }>,
  quoteId: string,
): number {
  if (quoteId === "") {
    return 0;
  }
  return invoices.filter(
    (invoice) => invoice.quoteId === quoteId && invoice.status !== "void",
  ).length;
}

export function hasDraftRevision(
  quotes: Array<{ revisedFromQuoteId: string | null; status: string }>,
  sourceQuoteId: string,
): boolean {
  if (sourceQuoteId === "") {
    return false;
  }
  return quotes.some(
    (quote) => quote.revisedFromQuoteId === sourceQuoteId && quote.status === "draft",
  );
}

/**
 * Sent and declined can be revised. Accepted only if nothing is billed yet.
 * Drafts are edited in place. Superseded quotes are history. Cancelled jobs cannot.
 */
export function canReviseQuote(input: {
  jobStatus: string;
  quoteStatus: string;
  liveInvoiceCount: number;
  hasDraftRevision: boolean;
}): boolean {
  if (input.jobStatus === "cancelled") {
    return false;
  }
  if (input.hasDraftRevision) {
    return false;
  }
  if (input.quoteStatus === "sent" || input.quoteStatus === "declined") {
    return true;
  }
  if (input.quoteStatus === "accepted") {
    return input.liveInvoiceCount === 0;
  }
  return false;
}

/** Sending a revision retires a live sent or accepted source. Declined stays declined. */
export function shouldSupersedeOnSend(sourceStatus: string): boolean {
  return sourceStatus === "sent" || sourceStatus === "accepted";
}

export function quoteRevisionLabel(sourceDocNumber: string | null | undefined): string | null {
  const trimmed = (sourceDocNumber ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  return `Revision of ${trimmed}`;
}
