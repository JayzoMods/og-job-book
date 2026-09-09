import { notFound } from "next/navigation";
import { PrintSheet } from "@/components/print-sheet";
import { loadDb } from "@/db/ready";
import { getJob, getQuoteById, isUuid } from "@/db/queries";
import { formatInstantAu } from "@/lib/ledger/print";
import { quoteRevisionLabel } from "@/lib/ledger/revise";
import { quoteDocumentStatus, quoteIsExpired } from "@/lib/ledger/terms";
import { todayIsoSydney } from "@/lib/ledger/tax";

export async function generateMetadata({
  params,
}: PageProps<"/jobs/[id]/quotes/[quoteId]/print">) {
  const { quoteId } = await params;
  return { title: `Print quote ${quoteId.slice(0, 8)}` };
}

export default async function PrintQuotePage({
  params,
}: PageProps<"/jobs/[id]/quotes/[quoteId]/print">) {
  const { id, quoteId } = await params;
  if (!isUuid(id) || !isUuid(quoteId)) {
    notFound();
  }
  const state = await loadDb();
  if (!state.ok || !state.org) {
    notFound();
  }
  const quote = await getQuoteById(state.db, quoteId);
  const job = quote ? await getJob(state.db, quote.jobId) : null;
  if (!quote || !job || job.id !== id) {
    notFound();
  }

  const today = todayIsoSydney();
  const expired = quoteIsExpired({
    status: quote.status,
    validUntil: quote.validUntil,
    today,
  });

  return (
    <PrintSheet
      kind="quote"
      jobHref={`/jobs/${job.id}`}
      docNumber={quote.docNumber}
      status={quote.status}
      statusLabel={quoteDocumentStatus(quote.status, quote.validUntil, today)}
      issuedLabel={formatInstantAu(quote.createdAt)}
      orgName={state.org.name}
      orgAddress={state.org.address}
      abn={state.org.abn}
      gstRegistered={state.org.gstRegistered}
      customerName={job.customerName}
      suburb={job.suburb}
      customerPhone={job.customerPhone}
      customerEmail={job.customerEmail}
      jobDescription={job.description}
      totals={quote.totals}
      validUntil={quote.validUntil}
      kindLine={quoteRevisionLabel(quote.revisedFromDocNumber) ?? undefined}
      notice={
        quote.status === "superseded"
          ? "This quote was superseded by a later numbered quote."
          : expired
            ? "This quote has expired."
            : undefined
      }
    />
  );
}
