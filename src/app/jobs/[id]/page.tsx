import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acceptQuoteAction,
  cancelJobAction,
  declineQuoteAction,
  deleteDraftQuoteAction,
  duplicateJobAction,
  issueClaimAction,
  issueCreditNoteAction,
  issueInvoiceAction,
  issueRetentionReleaseAction,
  issueVariationAction,
  recordPaymentAction,
  replaceQuoteLinesAction,
  reviseQuoteAction,
  appendRateItemsAction,
  saveJobNotesAction,
  saveInspectionAction,
  saveRecurringAction,
  sendQuoteAction,
  emailQuoteAction,
  emailInvoiceAction,
  payInvoiceWithCardAction,
  writeAccountingAction,
  writeQuoteShareAction,
  setRecurringStatusAction,
  voidCreditNoteAction,
  voidInvoiceAction,
  deleteRecurringAction,
  issueRecurringAction,
} from "@/app/actions";
import { DocumentPanel, LineFields, MarkupNote } from "@/components/document-panel";
import { QuoteCompose } from "@/components/quote-compose";
import { ShareLinkCopy } from "@/components/share-link-copy";
import { StatusPill } from "@/components/status-pill";
import { extractAiConfigured } from "@/lib/extract/lines";
import { loadDb } from "@/db/ready";
import { DEMO_IDS } from "@/data/demo-seed";
import {
  getInvoicesForJob,
  getJobInOrg,
  getQuotesForJob,
  getRecurringForJob,
  isUuid,
  listRateItems,
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
import {
  canReviseQuote,
  hasDraftRevision,
  liveInvoiceCountOnQuote,
  quoteRevisionLabel,
} from "@/lib/ledger/revise";
import {
  canIssueRecurring,
  parseRecurringFrequency,
  parseRecurringStatus,
  recurringFrequencyLabel,
  recurringIsDue,
  RECURRING_FREQUENCIES,
} from "@/lib/ledger/recurring";
import { canEmailDocument, emailSendConfigured } from "@/lib/ledger/email";
import { canShareQuote, parseShareToken, quoteSharePath } from "@/lib/ledger/share";
import { canChargeInvoice, stripeChargeConfigured } from "@/lib/ledger/stripe";
import {
  accountingWriteConfigured,
  canWriteCredit,
  canWriteInvoice,
} from "@/lib/ledger/accounting";
import { inspectionPrintLines, REPORT_TYPE_OPTIONS } from "@/lib/ledger/inspection";
import { invoicePayDetails, invoicePayLines } from "@/lib/ledger/pay";
import { formatIsoDateAu } from "@/lib/ledger/print";
import { todayIsoSydney, lineUnitLabel, parseLineUnit } from "@/lib/ledger/tax";
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
  notes: "Job notes cannot be longer than 2,000 characters.",
  inspection:
    "Property, vendor, and purchaser are optional. Property is at most 200 characters. Vendor and purchaser are at most 120. Report type must be one of the listed kinds, or none.",
  revise:
    "This quote cannot be revised. Drafts are edited in place. Accepted quotes with invoices stay as they are. Only one draft revision can be open at a time.",
  job: "Could not duplicate this job.",
  rate: "Tick at least one rate to drop onto a draft quote.",
  cost: "Cost is optional. If you enter one, it must be a positive amount. It is not printed.",
  recurring:
    "A recurring invoice needs a cadence, a next issue date, and at least one complete line. The end date cannot be before the next issue date. Issue is manual. Cancelled jobs cannot take a new issue.",
  email:
    "Email needs a customer address and a sent quote or live invoice. Drafts, superseded quotes, and void invoices are not emailed.",
  stripe:
    "Card pay needs a live invoice with amount due now. Drafts and void invoices are not charged.",
  accounting:
    "Accounting write needs a sent or paid invoice, or an issued credit note for Xero. Drafts and void documents are not posted. MYOB is invoices only.",
  share:
    "Only a sent, accepted, declined, or superseded quote has a share link. Drafts stay in this ledger. The link is not a customer portal.",
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
  const job = org ? await getJobInOrg(db, id, org.id) : null;
  if (!job || !org) {
    notFound();
  }
  const [quoteList, invoiceList, rateItems, recurringList] = await Promise.all([
    getQuotesForJob(db, id),
    getInvoicesForJob(db, id),
    listRateItems(db, org.id),
    getRecurringForJob(db, id),
  ]);
  const errorKey = typeof query.error === "string" ? query.error : "";
  const error = ERRORS[errorKey];
  const emailed = query.emailed === "1";
  const cardReturned = query.card === "1";
  const accountingWritten = query.accounting === "1";
  const shareReady = query.share === "1";
  const emailConfigured = emailSendConfigured();
  const stripeConfigured = stripeChargeConfigured();
  const accountingConfigured = accountingWriteConfigured();
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
    <div className="page-frame">
      <p>
        <Link href="/#jobs" className="text-sm font-semibold text-navy underline-offset-2 hover:underline">
          ← Jobs
        </Link>
      </p>
      <div className="space-y-4" data-tour="job">
      <nav className="job-toc" aria-label="On this job">
        <a href="#quotes">Quotes</a>
        <a href="#invoices">Invoices</a>
        <a href="#recurring">Recurring</a>
        <a href="#inspection">Inspection</a>
        <a href="#job-notes">Notes</a>
      </nav>
      <section className="surface surface-hero rise p-6">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Job</p>
            <h1 className="mt-2 font-display text-3xl sm:text-4xl">{job.customerName}</h1>
            <p className="mt-1 text-muted">
              {job.suburb} · {job.description}
            </p>
            {job.customerPhone ? (
              <p className="mt-2 text-sm text-muted">Phone {job.customerPhone}</p>
            ) : null}
            {job.customerEmail ? (
              <p className="text-sm text-muted">Email {job.customerEmail}</p>
            ) : null}
            {inspectionPrintLines(job).map((line) => (
              <p key={line.label} className="mt-1 text-sm text-muted">
                {line.label} {line.value}
              </p>
            ))}
            <p className="mt-2 text-sm text-muted">
              Phone and email are shown as given.
            </p>
            {job.duplicatedFromJobId ? (
              <p className="mt-2 text-sm text-muted">
                Duplicated from an earlier job.{" "}
                <Link
                  href={`/jobs/${job.duplicatedFromJobId}`}
                  className="text-navy underline-offset-2 hover:underline"
                >
                  Open original
                </Link>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={job.status} />
            <Link
              href={`/customers/${job.customerId}/statement/print`}
              className="btn btn-ghost"
            >
              Print statement
            </Link>
            <form action={duplicateJobAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <button type="submit" className="btn btn-ghost">
                Duplicate job
              </button>
            </form>
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
      </div>

      {error ? (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      ) : null}
      {emailed ? (
        <p className="banner" role="status">
          Emailed the document to the customer address.
        </p>
      ) : null}
      {cardReturned ? (
        <p className="banner" role="status">
          Returned from Stripe Checkout. The books update when Stripe posts the webhook.
        </p>
      ) : null}
      {accountingWritten ? (
        <p className="banner" role="status">
          Posted the document to Xero or MYOB. This ledger does not store the remote id.
        </p>
      ) : null}
      {shareReady ? (
        <p className="banner" role="status">
          Share link updated. The old token no longer opens the quote.
        </p>
      ) : null}

      <section id="inspection" className="surface job-section p-6" data-tour="inspection">
        <h2 className="font-display text-2xl">Inspection</h2>
        <p className="mt-2 text-sm text-muted">
          Optional site fields for an inspection job. Printed on the quote and invoice.
          Job notes below stay internal.
        </p>
        <form action={saveInspectionAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="jobId" value={job.id} />
          <label className="text-sm sm:col-span-2">
            Property
            <input
              className="field mt-1"
              name="propertyAddress"
              maxLength={200}
              defaultValue={job.propertyAddress}
            />
          </label>
          <label className="text-sm">
            Vendor
            <input
              className="field mt-1"
              name="vendorName"
              maxLength={120}
              defaultValue={job.vendorName}
            />
          </label>
          <label className="text-sm">
            Purchaser
            <input
              className="field mt-1"
              name="purchaserName"
              maxLength={120}
              defaultValue={job.purchaserName}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Report type
            <select className="field mt-1" name="reportType" defaultValue={job.reportType}>
              {REPORT_TYPE_OPTIONS.map((option) => (
                <option key={option.value || "none"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <button type="submit" className="btn btn-ghost">
              Save inspection
            </button>
          </div>
        </form>
      </section>

      <section id="job-notes" className="surface job-section p-6">
        <h2 className="font-display text-2xl">Job notes</h2>
        <p className="mt-2 text-sm text-muted">
          Internal only. Not printed on the quote or invoice.
        </p>
        <form action={saveJobNotesAction} className="mt-4 grid gap-3">
          <input type="hidden" name="jobId" value={job.id} />
          <label className="text-sm">
            Notes
            <textarea
              className="field mt-1 min-h-24"
              name="notes"
              maxLength={2000}
              defaultValue={job.notes}
            />
          </label>
          <div>
            <button type="submit" className="btn btn-ghost">
              Save notes
            </button>
          </div>
        </form>
      </section>

      <section id="recurring" className="job-section space-y-4" data-tour="recurring">
        <h2 className="font-display text-2xl">Recurring invoices</h2>
        <p className="text-sm text-muted">
          A line template you issue again on a cadence. Issue one period at a time —
          issuing does not email. Changing the template does not rewrite invoices already
          issued. Retention is not held on these invoices.
        </p>
        {recurringList.map((template) => {
          const cadence = parseRecurringFrequency(template.frequency);
          const issuable = canIssueRecurring({
            status: template.status,
            frequency: template.frequency,
            nextIssueOn: template.nextIssueOn,
            endOn: template.endOn,
            hasLines: template.lines.length > 0,
            jobStatus: job.status,
          });
          const due = recurringIsDue(
            {
              status: template.status,
              frequency: template.frequency,
              nextIssueOn: template.nextIssueOn,
              endOn: template.endOn,
              hasLines: template.lines.length > 0,
              jobStatus: job.status,
            },
            today,
          );
          const paused = parseRecurringStatus(template.status) === "paused";
          const statusLabel = paused ? "paused" : due ? "due" : issuable ? "active" : "ended";
          return (
            <DocumentPanel
              key={template.id}
              title={
                cadence
                  ? `${recurringFrequencyLabel(cadence)} · next ${formatIsoDateAu(template.nextIssueOn)}`
                  : `Recurring · next ${formatIsoDateAu(template.nextIssueOn)}`
              }
              status={statusLabel}
              abn={org.abn}
              gstRegistered={org.gstRegistered}
              totals={template.totals}
              extra={
                job.status !== "cancelled" ? (
                  <div className="space-y-3">
                    {template.endOn ? (
                      <p className="text-sm text-muted">
                        Ends {formatIsoDateAu(template.endOn)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted">No end date</p>
                    )}
                    <form action={saveRecurringAction} className="space-y-3">
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="recurringId" value={template.id} />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="text-sm">
                          Cadence
                          <select
                            className="field mt-1"
                            name="frequency"
                            defaultValue={cadence ?? "monthly"}
                          >
                            {RECURRING_FREQUENCIES.map((value) => (
                              <option key={value} value={value}>
                                {recurringFrequencyLabel(value)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm">
                          Next issue
                          <input
                            className="field mt-1"
                            type="date"
                            name="nextIssueOn"
                            required
                            defaultValue={template.nextIssueOn}
                          />
                        </label>
                        <label className="text-sm">
                          End date (optional)
                          <input
                            className="field mt-1"
                            type="date"
                            name="endOn"
                            defaultValue={template.endOn ?? ""}
                          />
                        </label>
                      </div>
                      <LineFields lines={template.lines} />
                      <button type="submit" className="btn btn-ghost">
                        Save template
                      </button>
                    </form>
                  </div>
                ) : null
              }
            >
              {issuable ? (
                <form action={issueRecurringAction}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="recurringId" value={template.id} />
                  <button type="submit" className="btn btn-primary">
                    {due ? "Issue due invoice" : "Issue next invoice"}
                  </button>
                </form>
              ) : null}
              {job.status !== "cancelled" ? (
                <>
                  <form action={setRecurringStatusAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="recurringId" value={template.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={paused ? "active" : "paused"}
                    />
                    <button type="submit" className="btn btn-ghost">
                      {paused ? "Resume" : "Pause"}
                    </button>
                  </form>
                  <form action={deleteRecurringAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="recurringId" value={template.id} />
                    <button type="submit" className="btn btn-ghost">
                      Delete template
                    </button>
                  </form>
                </>
              ) : null}
            </DocumentPanel>
          );
        })}
        {job.status !== "cancelled" ? (
          <form action={saveRecurringAction} className="surface space-y-3 p-5">
            <input type="hidden" name="jobId" value={job.id} />
            <p className="text-sm font-semibold">Add a recurring invoice</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-sm">
                Cadence
                <select className="field mt-1" name="frequency" defaultValue="monthly">
                  {RECURRING_FREQUENCIES.map((value) => (
                    <option key={value} value={value}>
                      {recurringFrequencyLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Next issue
                <input
                  className="field mt-1"
                  type="date"
                  name="nextIssueOn"
                  required
                  defaultValue={today}
                />
              </label>
              <label className="text-sm">
                End date (optional)
                <input className="field mt-1" type="date" name="endOn" />
              </label>
            </div>
            <LineFields />
            <button type="submit" className="btn btn-ghost">
              Save template
            </button>
          </form>
        ) : (
          <p className="text-muted">This job is cancelled. No new recurring invoices.</p>
        )}
      </section>

      <section id="quotes" className="job-section space-y-4">
        <h2 className="font-display text-2xl">Quotes</h2>
        <p className="text-sm text-muted">
          A sent quote can be opened at a share link without the job URL. Drafts are
          not shared. The link is not a customer portal.
        </p>
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
          const revisionLabel = quoteRevisionLabel(quote.revisedFromDocNumber);
          const canRevise = canReviseQuote({
            jobStatus: job.status,
            quoteStatus: quote.status,
            liveInvoiceCount: liveInvoiceCountOnQuote(
              invoiceList.map((invoice) => ({
                quoteId: invoice.quoteId,
                status: invoice.status,
              })),
              quote.id,
            ),
            hasDraftRevision: hasDraftRevision(
              quoteList.map((row) => ({
                revisedFromQuoteId: row.revisedFromQuoteId,
                status: row.status,
              })),
              quote.id,
            ),
          });
          const shareToken = parseShareToken(quote.shareToken);
          return (
          <DocumentPanel
            key={quote.id}
            tourId={quote.id === DEMO_IDS.quoteMixed ? "quote-gst" : undefined}
            title={`Quote ${quote.docNumber}`}
            status={quoteDocumentStatus(quote.status, quote.validUntil, today)}
            abn={org.abn}
            gstRegistered={org.gstRegistered}
            totals={quote.totals}
            extra={
              <div className="space-y-3">
                <MarkupNote lines={quote.lines} />
                {revisionLabel ? (
                  <p className="text-sm">{revisionLabel}</p>
                ) : null}
                {quote.status === "superseded" ? (
                  <p className="text-sm text-muted">
                    This quote was superseded by a later numbered quote.
                  </p>
                ) : null}
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
                <>
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
                  <LineFields lines={quote.lines} showCost />
                  <button type="submit" className="btn btn-ghost">
                    Save line changes
                  </button>
                </form>
                {rateItems.length > 0 ? (
                  <form action={appendRateItemsAction} className="space-y-2">
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <input type="hidden" name="jobId" value={job.id} />
                    <p className="text-sm font-semibold">Add from rate card</p>
                    <ul className="space-y-1">
                      {rateItems.map((item) => (
                        <li key={item.id}>
                          <label className="flex flex-wrap items-center gap-2 text-sm">
                            <input type="checkbox" name="rateItemId" value={item.id} />
                            <span>
                              {item.description} · {formatAudFromCents(item.unitPriceCents)} /{" "}
                              {lineUnitLabel(parseLineUnit(item.unit))}
                              {item.unitCostCents
                                ? ` · cost ${formatAudFromCents(item.unitCostCents)}`
                                : ""}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <button type="submit" className="btn btn-ghost">
                      Add selected rates
                    </button>
                  </form>
                ) : null}
                </>
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
            {canShareQuote(quote.status) ? (
              shareToken ? (
                <>
                  <Link href={quoteSharePath(shareToken)} className="btn btn-ghost">
                    Open share link
                  </Link>
                  <ShareLinkCopy key={shareToken} path={quoteSharePath(shareToken)} />
                  <form action={writeQuoteShareAction}>
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="rotate" value="1" />
                    <button type="submit" className="btn btn-ghost">
                      New share link
                    </button>
                  </form>
                </>
              ) : (
                <form action={writeQuoteShareAction}>
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <button type="submit" className="btn btn-ghost">
                    Create share link
                  </button>
                </form>
              )
            ) : null}
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
            {emailConfigured && canEmailDocument("quote", quote.status) ? (
              <form action={emailQuoteAction}>
                <input type="hidden" name="quoteId" value={quote.id} />
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className="btn btn-ghost">
                  Email quote
                </button>
              </form>
            ) : null}
            {canRevise ? (
              <form action={reviseQuoteAction}>
                <input type="hidden" name="quoteId" value={quote.id} />
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className="btn btn-ghost">
                  Revise quote
                </button>
              </form>
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
            rateItems={rateItems}
          />
        ) : (
          <p className="text-muted">This job is cancelled. No new quotes.</p>
        )}
      </section>

      <section id="invoices" className="job-section space-y-4">
        <h2 className="font-display text-2xl">Invoices and payments</h2>
        {invoiceList.length === 0 ? (
          <p className="text-muted">
            No invoices yet. Accept a quote and issue an invoice, or issue from a
            recurring template.
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
                tourId={
                  invoice.id === DEMO_IDS.invoiceUnpaid
                    ? "invoice-due"
                    : invoice.id === DEMO_IDS.invoice
                      ? "invoice-paid"
                      : undefined
                }
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
                          Shown as given. We do not check this account.
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
                          <li key={payment.id} className="flex flex-wrap items-center gap-2">
                            <span>
                              {payment.paidOn} · {payment.method} ·{" "}
                              {formatAudFromCents(payment.amountCents)}
                            </span>
                            <Link
                              href={`/jobs/${job.id}/invoices/${invoice.id}/payments/${payment.id}/print`}
                              className="text-navy underline-offset-2 hover:underline"
                            >
                              Print remittance
                            </Link>
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
                    {stripeConfigured &&
                    canChargeInvoice(invoice.status, remainingCents) &&
                    job.status !== "cancelled" ? (
                      <form action={payInvoiceWithCardAction}>
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button type="submit" className="btn btn-ghost">
                          Pay with card
                        </button>
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
                {emailConfigured && canEmailDocument("invoice", invoice.status) ? (
                  <form action={emailInvoiceAction}>
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="jobId" value={job.id} />
                    <button type="submit" className="btn btn-ghost">
                      Email invoice
                    </button>
                  </form>
                ) : null}
                {accountingConfigured &&
                canWriteInvoice(invoice.status) &&
                job.status !== "cancelled" ? (
                  <>
                    <form action={writeAccountingAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="id" value={invoice.id} />
                      <input type="hidden" name="provider" value="xero" />
                      <input type="hidden" name="kind" value="invoice" />
                      <button type="submit" className="btn btn-ghost">
                        Send to Xero
                      </button>
                    </form>
                    <form action={writeAccountingAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="id" value={invoice.id} />
                      <input type="hidden" name="provider" value="myob" />
                      <input type="hidden" name="kind" value="invoice" />
                      <button type="submit" className="btn btn-ghost">
                        Send to MYOB
                      </button>
                    </form>
                  </>
                ) : null}
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
                  {accountingConfigured &&
                  canWriteCredit(note.status) &&
                  job.status !== "cancelled" ? (
                    <form action={writeAccountingAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="id" value={note.id} />
                      <input type="hidden" name="provider" value="xero" />
                      <input type="hidden" name="kind" value="credit" />
                      <button type="submit" className="btn btn-ghost">
                        Send to Xero
                      </button>
                    </form>
                  ) : null}
                </DocumentPanel>
              ))}
              </div>
            );
          })}
      </section>
    </div>
  );
}
