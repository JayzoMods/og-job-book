import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acceptQuoteAction,
  cancelJobAction,
  declineQuoteAction,
  deleteDraftQuoteAction,
  issueClaimAction,
  issueCreditNoteAction,
  issueInvoiceAction,
  issueRetentionReleaseAction,
  issueVariationAction,
  recordPaymentAction,
  replaceQuoteLinesAction,
  sendQuoteAction,
  voidCreditNoteAction,
  voidInvoiceAction,
} from "@/app/actions";
import { DocumentPanel, LineFields } from "@/components/document-panel";
import { QuoteCompose } from "@/components/quote-compose";
import { extractAiConfigured } from "@/lib/extract/lines";
import { loadDb } from "@/db/ready";
import {
  getInvoicesForJob,
  getJob,
  getQuotesForJob,
  isUuid,
} from "@/db/queries";
import { formatAudFromCents } from "@/lib/ledger/money";
import { invoiceSettlement } from "@/lib/ledger/credit";
import {
  claimedCentsFromInvoices,
  invoiceKindSubtitle,
  invoicePanelTitle,
  netRetentionHeldCents,
  parseInvoiceKind,
  remainingContractCents,
} from "@/lib/ledger/claim";
import { invoicePayDetails, invoicePayLines } from "@/lib/ledger/pay";
import { formatIsoDateAu } from "@/lib/ledger/print";
import { todayIsoSydney } from "@/lib/ledger/tax";
import {
  defaultQuoteValidUntil,
  invoiceDocumentStatus,
  invoiceIsOverdue,
  paymentTermsLabel,
  quoteDocumentStatus,
  quoteIsExpired,
} from "@/lib/ledger/terms";

const ERRORS: Record<string, string> = {
  lines: "Add at least one complete line (description, qty, unit price, tax code).",
  quote: "Could not save the quote. Cancelled jobs cannot take new quotes.",
  invoice: "A full invoice needs an accepted quote with nothing already claimed against it.",
  payment: "Payment needs a positive amount, a date, and a method.",
  cancel: "A paid job cannot be cancelled.",
  void: "Only an unpaid invoice can be voided.",
  credit:
    "Credit needs at least one line and cannot be more than the amount still owing.",
  claim:
    "Deposit and progress claims need a whole percent from 1 to 100 and cannot exceed what is left on the quote.",
  variation: "A variation needs at least one complete line.",
  retention: "Retention release cannot exceed the amount held.",
};

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  return { title: `Job ${id.slice(0, 8)}` };
}

export default async function JobPage({
  params,
  searchParams,
}: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  if (!isUuid(id)) {
    notFound();
  }
  const state = await loadDb();
  if (!state.ok) {
    notFound();
  }
  const { db, org } = state;
  const job = await getJob(db, id);
  if (!job || !org) {
    notFound();
  }
  const [quoteList, invoiceList] = await Promise.all([
    getQuotesForJob(db, id),
    getInvoicesForJob(db, id),
  ]);
  const errorKey = typeof query.error === "string" ? query.error : "";
  const error = ERRORS[errorKey];
  const today = todayIsoSydney();
  const payLines = invoicePayLines(
    invoicePayDetails({
      accountName: org.accountName,
      bsb: org.bsb,
      accountNumber: org.accountNumber,
      payId: org.payId,
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <p>
        <Link href="/" className="text-sm text-navy underline-offset-2 hover:underline">
          ← Jobs
        </Link>
      </p>
      <section className="surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">{job.customerName}</h1>
            <p className="mt-1 text-muted">
              {job.suburb} · {job.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill">{job.status}</span>
            {job.status !== "paid" && job.status !== "cancelled" ? (
              <form action={cancelJobAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className="btn btn-ghost">
                  Cancel job
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-error/40 bg-foam px-4 py-3 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Quotes</h2>
        {quoteList.length === 0 ? (
          <p className="text-muted">No quotes yet.</p>
        ) : null}
        {quoteList.map((quote) => {
          const expired = quoteIsExpired({
            status: quote.status,
            validUntil: quote.validUntil,
            today,
          });
          const invoiceRows = invoiceList.map((invoice) => ({
            quoteId: invoice.quoteId,
            status: invoice.status,
            kind: invoice.kind,
            totalCents: invoice.totals.totalCents,
            retentionHeldCents: invoice.retentionHeldCents,
          }));
          const remaining = remainingContractCents(
            quote.totals.totalCents,
            claimedCentsFromInvoices(invoiceRows, quote.id),
          );
          const held = netRetentionHeldCents(invoiceRows, quote.id);
          return (
          <DocumentPanel
            key={quote.id}
            title={`Quote ${quote.docNumber}`}
            status={quoteDocumentStatus(quote.status, quote.validUntil, today)}
            abn={org.abn}
            gstRegistered={org.gstRegistered}
            totals={quote.totals}
            extra={
              <div className="space-y-3">
                {quote.status !== "draft" ? (
                  <p className="text-sm">
                    Valid until {formatIsoDateAu(quote.validUntil)}
                  </p>
                ) : null}
                {expired ? (
                  <p className="text-sm text-warn">
                    This quote has expired. You can still accept it.
                  </p>
                ) : null}
                {quote.status === "accepted" && job.status !== "cancelled" ? (
                  <div className="space-y-4 text-sm">
                    <p>
                      Contract remaining {formatAudFromCents(remaining)} of{" "}
                      {formatAudFromCents(quote.totals.totalCents)}. Retention held{" "}
                      {formatAudFromCents(held)}.
                    </p>
                    <p className="text-muted">
                      Deposit and progress claims are billed as one GST-inclusive line
                      against this quote. Variations are extra work. Retention is a hold of
                      billed amounts, stamped when the invoice is issued. Not tax advice.
                      Not dispatch.
                    </p>
                    {remaining > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <form action={issueClaimAction} className="space-y-2">
                          <input type="hidden" name="quoteId" value={quote.id} />
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="kind" value="deposit" />
                          <label className="block">
                            Deposit % of quote
                            <input
                              className="field mt-1"
                              name="percent"
                              inputMode="numeric"
                              defaultValue="20"
                              required
                            />
                          </label>
                          <button type="submit" className="btn btn-ghost">
                            Issue deposit
                          </button>
                        </form>
                        <form action={issueClaimAction} className="space-y-2">
                          <input type="hidden" name="quoteId" value={quote.id} />
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="kind" value="progress" />
                          <label className="block">
                            Progress claim % of quote
                            <input
                              className="field mt-1"
                              name="percent"
                              inputMode="numeric"
                              defaultValue="40"
                              required
                            />
                          </label>
                          <button type="submit" className="btn btn-ghost">
                            Issue progress claim
                          </button>
                        </form>
                      </div>
                    ) : null}
                    {remaining > 0 && remaining < quote.totals.totalCents ? (
                      <form action={issueClaimAction}>
                        <input type="hidden" name="quoteId" value={quote.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <input type="hidden" name="kind" value="progress" />
                        <input type="hidden" name="remainder" value="yes" />
                        <button type="submit" className="btn btn-ghost">
                          Issue remaining {formatAudFromCents(remaining)}
                        </button>
                      </form>
                    ) : null}
                    <form action={issueVariationAction} className="space-y-3">
                      <input type="hidden" name="quoteId" value={quote.id} />
                      <input type="hidden" name="jobId" value={job.id} />
                      <p className="text-muted">
                        Variation lines are extra billed work. They do not reduce the quote
                        remaining.
                      </p>
                      <LineFields />
                      <button type="submit" className="btn btn-ghost">
                        Issue variation
                      </button>
                    </form>
                    {held > 0 ? (
                      <form
                        action={issueRetentionReleaseAction}
                        className="grid gap-2 sm:grid-cols-2"
                      >
                        <input type="hidden" name="quoteId" value={quote.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <label>
                          Retention release
                          <input
                            className="field mt-1"
                            name="amount"
                            required
                            defaultValue={(held / 100).toFixed(2)}
                            inputMode="decimal"
                          />
                        </label>
                        <div className="flex items-end">
                          <button type="submit" className="btn btn-ghost w-full">
                            Issue retention release
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                ) : null}
                {quote.status === "draft" && job.status !== "cancelled" ? (
                <form action={replaceQuoteLinesAction} className="space-y-4">
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <label className="block text-sm">
                    Valid until
                    <input
                      className="field mt-1"
                      type="date"
                      name="valid_until"
                      required
                      defaultValue={quote.validUntil}
                    />
                  </label>
                  <LineFields lines={quote.lines} />
                  <button type="submit" className="btn btn-ghost">
                    Save line changes
                  </button>
                </form>
                ) : null}
              </div>
            }
          >
            <Link
              href={`/jobs/${job.id}/quotes/${quote.id}/print`}
              className="btn btn-ghost"
            >
              Print / PDF
            </Link>
            {quote.status === "draft" && job.status !== "cancelled" ? (
              <>
                <form action={sendQuoteAction}>
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <button type="submit" className="btn btn-primary">
                    Send quote
                  </button>
                </form>
                <form action={deleteDraftQuoteAction}>
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <button type="submit" className="btn btn-ghost">
                    Delete draft
                  </button>
                </form>
              </>
            ) : null}
            {quote.status === "sent" && job.status !== "cancelled" ? (
              <>
                <form action={acceptQuoteAction}>
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <button type="submit" className="btn btn-primary">
                    Accept quote
                  </button>
                </form>
                <form action={declineQuoteAction}>
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <button type="submit" className="btn btn-ghost">
                    Decline
                  </button>
                </form>
              </>
            ) : null}
            {quote.status === "accepted" &&
            job.status !== "cancelled" &&
            remaining === quote.totals.totalCents ? (
              <form action={issueInvoiceAction}>
                <input type="hidden" name="quoteId" value={quote.id} />
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className="btn btn-primary">
                  Issue invoice
                </button>
              </form>
            ) : null}
          </DocumentPanel>
          );
        })}

        {job.status !== "cancelled" ? (
          <QuoteCompose
            jobId={job.id}
            extractConfigured={extractAiConfigured()}
            defaultValidUntil={defaultQuoteValidUntil(today)}
          />
        ) : (
          <p className="text-muted">This job is cancelled. No new quotes.</p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Invoices and payments</h2>
        {invoiceList.length === 0 ? (
          <p className="text-muted">
            No invoices yet. Accept a quote, then issue an invoice, deposit, progress
            claim, or variation.
          </p>
        ) : null}
        {invoiceList.map((invoice) => {
            const kind = parseInvoiceKind(invoice.kind);
            const kindLine = invoiceKindSubtitle({
              kind,
              quoteDocNumber:
                quoteList.find((quote) => quote.id === invoice.quoteId)?.docNumber ?? "",
              percent: invoice.claimPercent,
            });
            const { remainingCents, payState } = invoiceSettlement({
              invoiceTotalCents: invoice.totals.totalCents,
              paidCents: invoice.paidCents,
              creditedCents: invoice.creditedCents,
              retentionHeldCents: invoice.retentionHeldCents,
            });
            const overdue = invoiceIsOverdue({
              status: invoice.status,
              dueDate: invoice.dueDate,
              remainingCents,
              today,
            });
            return (
              <div key={invoice.id} className="space-y-4">
              <DocumentPanel
                title={invoicePanelTitle(invoice.docNumber, kind)}
                status={invoiceDocumentStatus(invoice.status, payState, overdue)}
                abn={org.abn}
                gstRegistered={org.gstRegistered}
                totals={invoice.totals}
                extra={
                  <div className="space-y-2 text-sm">
                    <p>
                      Payment terms: {paymentTermsLabel(invoice.paymentTermsDays)}. Due{" "}
                      {formatIsoDateAu(invoice.dueDate)}
                    </p>
                    {kindLine ? <p>{kindLine}</p> : null}
                    {invoice.retentionHeldCents > 0 ? (
                      <p>
                        Retention held {formatAudFromCents(invoice.retentionHeldCents)}. Amount
                        due {formatAudFromCents(remainingCents)}.
                      </p>
                    ) : null}
                    {payLines.length > 0 ? (
                      <div className="space-y-1">
                        <dl className="space-y-1">
                          {payLines.map((line) => (
                            <div key={line.label} className="flex justify-between gap-4">
                              <dt className="text-muted">{line.label}</dt>
                              <dd className="font-mono">{line.value}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="text-muted">
                          Shown as given. Not Confirmation of Payee. We do not check this
                          account.
                        </p>
                      </div>
                    ) : null}
                    {overdue ? (
                      <p className="text-warn">This invoice is overdue.</p>
                    ) : null}
                    {invoice.creditedCents > 0 ? (
                      <p>
                        Credited {formatAudFromCents(invoice.creditedCents)} of{" "}
                        {formatAudFromCents(invoice.totals.totalCents)}
                      </p>
                    ) : null}
                    <p>
                      Recorded {formatAudFromCents(invoice.paidCents)} of{" "}
                      {formatAudFromCents(invoice.totals.totalCents)}
                    </p>
                    <p>
                      Balance {formatAudFromCents(remainingCents)}
                    </p>
                    {invoice.payments.length > 0 ? (
                      <ul className="text-muted">
                        {invoice.payments.map((payment) => (
                          <li key={payment.id}>
                            {payment.paidOn} · {payment.method} ·{" "}
                            {formatAudFromCents(payment.amountCents)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {invoice.status !== "void" && remainingCents > 0 && job.status !== "cancelled" ? (
                      <form
                        action={recordPaymentAction}
                        key={`${invoice.id}-${remainingCents}`}
                        className="grid gap-2 sm:grid-cols-4"
                      >
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <label className="text-sm">
                          Amount
                          <input
                            className="field mt-1"
                            name="amount"
                            required
                            defaultValue={(remainingCents / 100).toFixed(2)}
                            inputMode="decimal"
                          />
                        </label>
                        <label className="text-sm">
                          Date
                          <input
                            className="field mt-1"
                            type="date"
                            name="paidOn"
                            required
                            defaultValue={today}
                          />
                        </label>
                        <label className="text-sm">
                          Method
                          <select className="field mt-1" name="method" defaultValue="transfer">
                            <option value="transfer">Transfer</option>
                            <option value="cash">Cash</option>
                            <option value="card">Card</option>
                          </select>
                        </label>
                        <div className="flex items-end">
                          <button type="submit" className="btn btn-primary w-full">
                            Record payment
                          </button>
                        </div>
                      </form>
                    ) : null}
                    {invoice.status !== "void" && remainingCents > 0 && job.status !== "cancelled" ? (
                      <form action={issueCreditNoteAction} className="space-y-3">
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <p className="text-muted">
                          Issue a credit note to reduce the amount owing. Copy from the
                          invoice lines and reduce them. Cannot exceed the balance. Not a
                          refund. Not tax advice.
                        </p>
                        <label className="block text-sm">
                          Reason (optional)
                          <input className="field mt-1" name="reason" maxLength={200} />
                        </label>
                        <LineFields lines={invoice.lines} />
                        <button type="submit" className="btn btn-ghost">
                          Issue credit note
                        </button>
                      </form>
                    ) : null}
                    {invoice.status !== "void" && invoice.status !== "paid" ? (
                      <form action={voidInvoiceAction}>
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button type="submit" className="btn btn-ghost">
                          Void invoice
                        </button>
                      </form>
                    ) : null}
                  </div>
                }
              >
                <Link
                  href={`/jobs/${job.id}/invoices/${invoice.id}/print`}
                  className="btn btn-ghost"
                >
                  Print / PDF
                </Link>
              </DocumentPanel>
              {invoice.creditNotes.map((note) => (
                <DocumentPanel
                  key={note.id}
                  title={`Credit note ${note.docNumber}`}
                  status={note.status}
                  abn={org.abn}
                  gstRegistered={org.gstRegistered}
                  totals={note.totals}
                  extra={
                    <div className="space-y-2 text-sm">
                      <p>Against invoice {note.againstDocNumber}</p>
                      {note.reason ? <p>Reason: {note.reason}</p> : null}
                      {note.status === "issued" && job.status !== "cancelled" ? (
                        <form action={voidCreditNoteAction}>
                          <input type="hidden" name="creditNoteId" value={note.id} />
                          <input type="hidden" name="jobId" value={job.id} />
                          <button type="submit" className="btn btn-ghost">
                            Void credit note
                          </button>
                        </form>
                      ) : null}
                    </div>
                  }
                >
                  <Link
                    href={`/jobs/${job.id}/credits/${note.id}/print`}
                    className="btn btn-ghost"
                  >
                    Print / PDF
                  </Link>
                </DocumentPanel>
              ))}
              </div>
            );
          })}
      </section>
    </div>
  );
}
