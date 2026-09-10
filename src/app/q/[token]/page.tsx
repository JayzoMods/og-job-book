import { notFound } from "next/navigation";
import {
  respondToSharedQuoteAction,
} from "@/app/actions";
import { PrintSheet } from "@/components/print-sheet";
import { loadDb } from "@/db/ready";
import { getJob, getOrgById, getQuoteByShareToken } from "@/db/queries";
import {
  canRespondToSharedQuote,
  canShareQuote,
  parseShareToken,
} from "@/lib/ledger/share";
import { inspectionPrintLines } from "@/lib/ledger/inspection";
import { formatInstantAu } from "@/lib/ledger/print";
import { quoteRevisionLabel } from "@/lib/ledger/revise";
import { quoteDocumentStatus, quoteIsExpired } from "@/lib/ledger/terms";
import { todayIsoSydney } from "@/lib/ledger/tax";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const parsed = parseShareToken(token);
  if (!parsed) {
    return { title: "Quote" };
  }
  const state = await loadDb();
  if (!state.ok) {
    return { title: "Quote" };
  }
  const quote = await getQuoteByShareToken(state.db, parsed);
  return { title: quote ? `Quote ${quote.docNumber}` : "Quote" };
}

export default async function SharedQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const parsed = parseShareToken(token);
  if (!parsed) {
    notFound();
  }
  const state = await loadDb();
  if (!state.ok) {
    notFound();
  }
  const quote = await getQuoteByShareToken(state.db, parsed);
  const job = quote ? await getJob(state.db, quote.jobId) : null;
  const org = job ? await getOrgById(state.db, job.orgId) : null;
  if (!quote || !job || !org || !canShareQuote(quote.status)) {
    notFound();
  }

  const today = todayIsoSydney();
  const expired = quoteIsExpired({
    status: quote.status,
    validUntil: quote.validUntil,
    today,
  });
  const canRespond =
    canRespondToSharedQuote(quote.status) && job.status !== "cancelled";
  const error = query.error === "share";

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          className="print-toolbar mx-auto w-full max-w-[210mm] rounded-xl border border-error/40 bg-foam px-4 py-3 text-sm text-error"
          role="alert"
        >
          This quote cannot be accepted or declined from the link. Drafts are not
          shared. A sent quote that is already accepted, declined, or superseded is
          view only.
        </p>
      ) : null}
      <PrintSheet
        kind="quote"
        docNumber={quote.docNumber}
        status={quote.status}
        statusLabel={quoteDocumentStatus(quote.status, quote.validUntil, today)}
        issuedLabel={formatInstantAu(quote.createdAt)}
        orgName={org.name}
        orgAddress={org.address}
        abn={org.abn}
        gstRegistered={org.gstRegistered}
        customerName={job.customerName}
        suburb={job.suburb}
        customerPhone={job.customerPhone}
        customerEmail={job.customerEmail}
        jobDescription={job.description}
        inspectionLines={inspectionPrintLines(job)}
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
      <div className="print-toolbar mx-auto flex w-full max-w-[210mm] flex-col gap-3 px-4 pb-8 sm:px-6">
        {canRespond ? (
          <div className="flex flex-wrap gap-3">
            <form action={respondToSharedQuoteAction}>
              <input type="hidden" name="token" value={parsed} />
              <input type="hidden" name="decision" value="accept" />
              <button type="submit" className="btn btn-primary">
                Accept quote
              </button>
            </form>
            <form action={respondToSharedQuoteAction}>
              <input type="hidden" name="token" value={parsed} />
              <input type="hidden" name="decision" value="decline" />
              <button type="submit" className="btn btn-ghost">
                Decline
              </button>
            </form>
          </div>
        ) : null}
        <p className="text-sm text-muted">
          This link is the quote. It is not a customer portal and not an invoice.
        </p>
      </div>
    </div>
  );
}
