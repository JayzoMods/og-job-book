import Link from "next/link";
import type { CSSProperties } from "react";
import {
  applySampleBooksAction,
  createJobAction,
  deleteRateItemAction,
  issueRecurringAction,
  loadDemoAction,
  queueDueRecurringAction,
  saveCustomerAction,
  saveOrgAction,
  saveRateItemAction,
} from "@/app/actions";
import { HarbourScene } from "@/components/brand-mark";
import { FormFillTemplates } from "@/components/form-fill";
import { OrgAbnLookup } from "@/components/org-abn-lookup";
import { PendingSubmit } from "@/components/pending-submit";
import { StatusPill, jobAccent } from "@/components/status-pill";
import { TourStartButton } from "@/components/tour-start-button";
import { loadDb } from "@/db/ready";
import { listCustomers, listJobs, listRateItems, listRecurringForOrg } from "@/db/queries";
import { formatAbn, isValidAbn } from "@/lib/ledger/abn";
import { abrLookupConfigured } from "@/lib/ledger/abr";
import { centsToDollars, formatAudFromCents } from "@/lib/ledger/money";
import { unitMarkupText } from "@/lib/ledger/markup";
import { formatBsb } from "@/lib/ledger/pay";
import { lineUnitLabel, parseLineUnit, todayIsoSydney } from "@/lib/ledger/tax";
import { PAYMENT_TERMS_OPTIONS, parsePaymentTermsDays, paymentTermsLabel } from "@/lib/ledger/terms";
import { parseRetentionPercent, RETENTION_PERCENT_OPTIONS } from "@/lib/ledger/claim";
import { REPORT_TYPE_OPTIONS } from "@/lib/ledger/inspection";
import { canLoadDemo, authConfigured } from "@/lib/ledger/auth";
import { canApplySampleBooks, JOB_FORM_TEMPLATES, ORG_FORM_TEMPLATES } from "@/lib/ledger/templates";
import { formatIsoDateAu } from "@/lib/ledger/print";
import {
  parseRecurringFrequency,
  recurringFrequencyLabel,
  recurringIsDue,
} from "@/lib/ledger/recurring";
import { queueConfigured } from "@/lib/ledger/queue";
import { gstQuarterChoices, parseGstQuarter } from "@/lib/ledger/gst-quarter";

const ERRORS: Record<string, string> = {
  db: "Postgres is not connected. Run docker compose up -d, then npm run db:apply.",
  org: "Organisation fields were not valid.",
  job: "A job needs a description, and either an existing customer or a name and suburb. Phone, email, notes, and inspection fields are optional. Property is at most 200 characters. A non-empty email needs an @ and a domain. A non-empty phone needs at least 8 digits. Report type must be one of the listed kinds, or none.",
  customer:
    "Customer name and suburb are required. Name plus suburb must be unique. Phone and email are optional. A non-empty email needs an @ and a domain. A non-empty phone needs at least 8 digits.",
  rate: "A rate needs a description and a positive unit price. Description plus unit must be unique. Cost is optional; if entered it must be a positive amount.",
  recurring:
    "A recurring invoice needs a cadence, a next issue date, and at least one complete line. The end date cannot be before the next issue date. Issue from the job page is still a click.",
  queue:
    "Due invoices cannot be queued here. Issue one due invoice at a time.",
  statement:
    "Statement dates must be calendar days (YYYY-MM-DD). The from date cannot be after the as-at date.",
  export:
    "Pick JSON, CSV, or BAS Check CSV. Dates must be calendar days. The from date cannot be after the as-at date.",
  gst:
    "GST quarter must be a calendar quarter (YYYY-MM or a day in that quarter). Empty is this quarter in Australia/Sydney. This report is not a BAS and does not lodge.",
  auth:
    "Load demo is not available while sign-in is on. It would reset every organisation. Use Fill sample books on this account instead.",
  member:
    "Save the organisation after you sign in.",
  trial:
    "This 24-hour trial has ended. You can still read the books. Writes are locked.",
  template:
    "Sample books can only fill an empty account. This organisation already has customers, rates, or jobs.",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : "";
  const error = ERRORS[errorKey];
  const queued = typeof params.queued === "string" && params.queued === "1";
  const state = await loadDb();
  const db = state.ok ? state.db : null;
  const org = state.ok ? state.org : null;
  const [jobList, customerList, rateList, recurringList] =
    db && org
      ? await Promise.all([
          listJobs(db, org.id),
          listCustomers(db, org.id),
          listRateItems(db, org.id),
          listRecurringForOrg(db, org.id),
        ])
      : [[], [], [], []];
  const today = todayIsoSydney();
  const gstQuarter = parseGstQuarter("", today);
  const quarterChoices = gstQuarterChoices(today);
  const defaultQuarter = gstQuarter.ok ? gstQuarter.value : "";
  const authOn = authConfigured();
  const showLoadDemo = canLoadDemo(authOn);
  const trialLocked = state.ok && authOn && !state.trialWriteAllowed && Boolean(state.userId);
  const showSampleBooks =
    state.ok &&
    canApplySampleBooks({
      authOn,
      trialWriteAllowed: !trialLocked,
      jobCount: jobList.length,
      customerCount: customerList.length,
      rateCount: rateList.length,
    });
  const redisOn = queueConfigured();
  const dueRecurring = recurringList.filter((row) =>
    recurringIsDue(
      {
        status: row.status,
        frequency: row.frequency,
        nextIssueOn: row.nextIssueOn,
        endOn: row.endOn,
        hasLines: row.lines.length > 0,
        jobStatus: row.jobStatus,
      },
      today,
    ),
  );
  const needsSetup = !state.ok;
  const quotedCount = jobList.filter((job) => job.status === "quoted").length;
  const invoicedCount = jobList.filter((job) => job.status === "invoiced").length;
  const paidCount = jobList.filter((job) => job.status === "paid").length;

  return (
    <div className="page-frame">
      <section
        className="surface surface-hero rise grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_17rem]"
        data-tour="hero"
      >
        <div className="relative z-10 min-w-0">
          <p className="kicker">Australian ledger</p>
          <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
            Job, quote, invoice — with ABN and GST on the document.
          </h1>
          <p className="mt-4 max-w-2xl text-muted">
            Narrow ledger for a small AU trade or inspection business.
            {authOn
              ? state.ok && state.userId
                ? " Your books stay on this account."
                : " Sign in to open your books. A new account gets 24 hours."
              : " No login. Load demo seeds a fictional Sydney inspection org."}{" "}
            Not tax advice, and it does not lodge a BAS.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {showLoadDemo ? (
              <form action={loadDemoAction} data-tour="load-demo">
                <button type="submit" className="btn btn-primary">
                  Load demo
                </button>
              </form>
            ) : null}
            {showSampleBooks ? (
              <form action={applySampleBooksAction} data-tour="fill-template">
                <PendingSubmit
                  idle="Fill sample books"
                  busy="Filling books…"
                  className="btn btn-primary"
                />
              </form>
            ) : null}
            {authOn && !org && !showSampleBooks ? (
              <p className="text-sm text-muted">
                Save the organisation below for this signed-in user.
              </p>
            ) : null}
            <TourStartButton label="How it works" />
          </div>
          {showSampleBooks ? (
            <p className="mt-3 max-w-2xl text-sm text-muted">
              Fill sample books copies a fictional inspection ledger onto this account — jobs,
              quotes, and invoices with GST on the document. It does not wipe other
              organisations. Or pick a template on the organisation form.
            </p>
          ) : null}
        </div>
        <div className="relative z-10 mx-auto w-full max-w-sm lg:max-w-none">
          <HarbourScene className="h-auto w-full" />
        </div>
      </section>

      {error ? (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      ) : null}
      {trialLocked ? (
        <p className="banner banner-error" role="status">
          This 24-hour trial has ended. The books stay readable. Writes are locked.
        </p>
      ) : null}
      {queued ? (
        <p className="banner" role="status">
          Due invoices were queued. Each issue is one period.
        </p>
      ) : null}

      {needsSetup ? (
        <section className="surface rise p-6">
          <h2 className="font-display text-2xl">Set up Postgres</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              <code className="font-mono">docker compose up -d</code>
            </li>
            <li>
              Copy <code className="font-mono">.env.example</code> to{" "}
              <code className="font-mono">.env.local</code>
            </li>
            <li>
              <code className="font-mono">npm run db:apply</code>
            </li>
            <li>Reload this page and click Load demo.</li>
          </ol>
        </section>
      ) : null}

      {db && org ? (
        <section id="jobs" className="rise-2 flex flex-col gap-4">
          <div className="glance" data-tour="glance">
            <div className="surface glance-card">
              <p className="kicker">Jobs</p>
              <p className="glance-value mt-2">{jobList.length}</p>
            </div>
            <div className="surface glance-card">
              <p className="kicker">Quoted</p>
              <p className="glance-value mt-2">{quotedCount}</p>
            </div>
            <div className="surface glance-card">
              <p className="kicker">Invoiced</p>
              <p className="glance-value mt-2">{invoicedCount}</p>
            </div>
            <div className="surface glance-card">
              <p className="kicker">Paid</p>
              <p className="glance-value mt-2">{paidCount}</p>
            </div>
          </div>
          {dueRecurring.length > 0 ? (
            <section className="surface p-6">
              <h2 className="font-display text-2xl">Due recurring invoices</h2>
              <p className="mt-2 text-sm text-muted">
                Issue one period at a time. Issuing does not email the invoice.
              </p>
              {redisOn ? (
                <form action={queueDueRecurringAction} className="mt-3">
                  <button type="submit" className="btn btn-ghost">
                    Queue due invoices
                  </button>
                </form>
              ) : null}
              <ul className="mt-4 grid gap-3">
                {dueRecurring.map((row) => {
                  const cadence = parseRecurringFrequency(row.frequency);
                  return (
                    <li
                      key={row.id}
                      className="job-card surface flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="font-semibold">{row.customerName}</p>
                        <p className="text-sm text-muted">
                          {row.suburb} · {row.jobDescription} ·{" "}
                          {cadence ? recurringFrequencyLabel(cadence) : "Recurring"} ·
                          next {formatIsoDateAu(row.nextIssueOn)} ·{" "}
                          {formatAudFromCents(row.totals.totalCents)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/jobs/${row.jobId}`} className="btn btn-ghost">
                          Open job
                        </Link>
                        <form action={issueRecurringAction}>
                          <input type="hidden" name="jobId" value={row.jobId} />
                          <input type="hidden" name="recurringId" value={row.id} />
                          <button type="submit" className="btn btn-primary">
                            Issue due invoice
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <div className="surface p-6" data-tour="jobs">
            <h2 className="font-display text-2xl">Jobs</h2>
            {jobList.length === 0 ? (
              <p className="mt-3 text-muted">No jobs yet. Use a template or create one.</p>
            ) : (
              <ul className="mt-4 grid gap-3">
                {jobList.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="job-card surface flex flex-wrap items-center justify-between gap-3 p-4"
                      style={{ "--card-accent": jobAccent(job.status) } as CSSProperties}
                    >
                      <div>
                        <p className="font-semibold">{job.customerName}</p>
                        <p className="text-sm text-muted">
                          {job.suburb} · {job.description}
                        </p>
                      </div>
                      <StatusPill status={job.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {db ? (
        <section id="organisation" className="surface p-6" data-tour="organisation">
          <h2 className="font-display text-2xl">Organisation</h2>
          <div className="mt-3">
            <FormFillTemplates
              formId="organisation-form"
              templates={ORG_FORM_TEMPLATES}
              legend="Fill a template, then save."
            />
          </div>
          <form
            id="organisation-form"
            action={saveOrgAction}
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <label className="text-sm">
              Business name
              <input
                className="field mt-1"
                name="name"
                required
                defaultValue={org?.name ?? ""}
              />
            </label>
            <label className="text-sm">
              ABN
              <input
                className="field mt-1"
                name="abn"
                defaultValue={org ? formatAbn(org.abn) : ""}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Address
              <input
                className="field mt-1"
                name="address"
                required
                defaultValue={org?.address ?? ""}
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="gstRegistered"
                value="yes"
                defaultChecked={org?.gstRegistered ?? true}
              />
              GST registered
            </label>
            <label className="text-sm">
              Payment terms
              <select
                className="field mt-1"
                name="paymentTermsDays"
                defaultValue={String(parsePaymentTermsDays(org?.paymentTermsDays))}
              >
                {PAYMENT_TERMS_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {paymentTermsLabel(days)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Retention
              <select
                className="field mt-1"
                name="retentionPercent"
                defaultValue={String(parseRetentionPercent(org?.retentionPercent))}
              >
                {RETENTION_PERCENT_OPTIONS.map((percent) => (
                  <option key={percent} value={percent}>
                    {percent === 0 ? "None" : `${percent}% held on claims`}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Account name
              <input
                className="field mt-1"
                name="accountName"
                defaultValue={org?.accountName ?? ""}
                autoComplete="off"
              />
            </label>
            <label className="text-sm">
              BSB
              <input
                className="field mt-1"
                name="bsb"
                defaultValue={org ? formatBsb(org.bsb) : ""}
                inputMode="numeric"
                autoComplete="off"
              />
            </label>
            <label className="text-sm">
              Account number
              <input
                className="field mt-1"
                name="accountNumber"
                defaultValue={org?.accountNumber ?? ""}
                inputMode="numeric"
                autoComplete="off"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              PayID
              <input
                className="field mt-1"
                name="payId"
                defaultValue={org?.payId ?? ""}
                autoComplete="off"
              />
            </label>
            <p className="text-sm text-muted sm:col-span-2">
              If GST registered is off, quotes and invoices do not charge GST. Payment terms
              set the due date on new invoices. Retention is held when claims and invoices
              are issued. PayID and BSB print on invoices as entered — we do not check the
              account.
            </p>
            {org && !isValidAbn(org.abn) ? (
              <p className="text-sm text-warn sm:col-span-2">
                This ABN does not pass the Australian checksum. Documents will show that.
              </p>
            ) : null}
            <div>
              <button type="submit" className="btn btn-ghost">
                Save organisation
              </button>
            </div>
          </form>
          {org && abrLookupConfigured() ? (
            <div className="mt-4">
              <OrgAbnLookup
                abn={org.abn}
                gstRegistered={org.gstRegistered}
                lookupConfigured
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {db && org ? (
        <>
          <section className="surface p-6" id="customers" data-tour="customers">
            <h2 className="font-display text-2xl">Customers</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Jobs belong to a customer (name, suburb, optional phone and email). The same
              customer can have more than one job. Print a statement of account — not a tax
              invoice. Job notes stay internal. Phone and email are shown as given.
            </p>
            {customerList.length === 0 ? (
              <p className="mt-3 text-muted">
                No customers yet. Create a job with a name and suburb.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3">
                {customerList.map((customer) => (
                  <li key={customer.id} className="surface p-4">
                    <form
                      action={saveCustomerAction}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <input type="hidden" name="customerId" value={customer.id} />
                      <label className="text-sm">
                        Name
                        <input
                          className="field mt-1"
                          name="name"
                          required
                          defaultValue={customer.name}
                          maxLength={120}
                        />
                      </label>
                      <label className="text-sm">
                        Suburb
                        <input
                          className="field mt-1"
                          name="suburb"
                          required
                          defaultValue={customer.suburb}
                          maxLength={80}
                        />
                      </label>
                      <label className="text-sm">
                        Phone
                        <input
                          className="field mt-1"
                          name="phone"
                          defaultValue={customer.phone}
                          maxLength={40}
                        />
                      </label>
                      <label className="text-sm">
                        Email
                        <input
                          className="field mt-1"
                          name="email"
                          defaultValue={customer.email}
                          maxLength={80}
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                        <p className="text-sm text-muted">
                          {customer.jobCount === 1
                            ? "1 job"
                            : `${customer.jobCount} jobs`}
                        </p>
                        <button type="submit" className="btn btn-ghost">
                          Save customer
                        </button>
                      </div>
                    </form>
                    <form
                      method="get"
                      action={`/customers/${customer.id}/statement/print`}
                      className="mt-3 grid gap-3 sm:grid-cols-3"
                    >
                      <label className="text-sm">
                        From (optional)
                        <input className="field mt-1" type="date" name="from" />
                      </label>
                      <label className="text-sm">
                        As at
                        <input
                          className="field mt-1"
                          type="date"
                          name="asAt"
                          defaultValue={today}
                        />
                      </label>
                      <div className="flex items-end">
                        <button type="submit" className="btn btn-ghost w-full">
                          Print statement
                        </button>
                      </div>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface p-6" id="export" data-tour="export">
            <h2 className="font-display text-2xl">Export</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Download the books as JSON or CSV. The BAS Check CSV is sales lines in that
              app’s column order. Job notes and cost are not exported. This is not a BAS.
            </p>
            <form method="get" action="/api/export" className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                From (optional)
                <input className="field mt-1" type="date" name="from" />
              </label>
              <label className="text-sm">
                As at
                <input
                  className="field mt-1"
                  type="date"
                  name="asAt"
                  defaultValue={today}
                />
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="submit" className="btn btn-ghost" name="format" value="json">
                  Download JSON
                </button>
                <button type="submit" className="btn btn-ghost" name="format" value="csv">
                  Download CSV
                </button>
                <button type="submit" className="btn btn-ghost" name="format" value="bas-check">
                  Download BAS Check CSV
                </button>
              </div>
            </form>
          </section>

          <section className="surface p-6" id="gst-quarter" data-tour="gst-quarter">
            <h2 className="font-display text-2xl">GST quarter</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Print sales GST for an ATO quarter (Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun) by
              invoice date. Credit notes reduce the totals. Quotes, drafts, and void
              invoices are not included. Retention is a hold, not a GST adjustment. This
              is not a BAS and does not lodge.
            </p>
            <form
              method="get"
              action="/gst-quarter/print"
              className="mt-4 grid gap-3 sm:grid-cols-3"
            >
              <label className="text-sm sm:col-span-2">
                Quarter
                <select
                  className="field mt-1"
                  name="quarter"
                  defaultValue={defaultQuarter}
                >
                  {quarterChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button type="submit" className="btn btn-ghost w-full">
                  Print GST quarter
                </button>
              </div>
            </form>
          </section>

          <section className="surface p-6" id="api">
            <h2 className="font-display text-2xl">HTTP API</h2>
            <ul className="mt-2 max-w-2xl space-y-1 text-sm text-muted">
              <li>
                <code className="font-mono">POST /api/payment-webhook</code> — record a
                payment (same rules as Record payment).
              </li>
              <li>
                <code className="font-mono">POST /api/stripe-checkout</code> and{" "}
                <code className="font-mono">/api/stripe-webhook</code> — card pay when
                connected.
              </li>
              <li>
                <code className="font-mono">POST /api/send-email</code> — email a sent quote
                or live invoice when connected.
              </li>
              <li>
                <code className="font-mono">POST /api/accounting-write</code> — post a live
                invoice to Xero or MYOB when connected.
              </li>
              <li>
                <code className="font-mono">POST /api/quote-share</code> — share a sent quote
                at <code className="font-mono">/q/{"{token}"}</code>.
              </li>
              <li>
                <code className="font-mono">POST /api/queue-run</code> — queue due recurring
                invoices when connected.
              </li>
            </ul>
            <p className="mt-3">
              <Link className="text-navy underline-offset-2 hover:underline" href="/openapi.yaml">
                OpenAPI
              </Link>
            </p>
          </section>

          <section className="surface p-6" id="rates" data-tour="rates">
            <h2 className="font-display text-2xl">Rate card</h2>
            <p className="mt-2 text-sm text-muted">
              Sell prices for this organisation, with optional cost. Markup is (sell − cost) ÷
              cost. Cost is not printed.
            </p>
            {rateList.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No rates yet.</p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {rateList.map((item) => (
                  <li key={item.id} className="rounded-xl border border-line p-4">
                    <form action={saveRateItemAction} className="grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="rateItemId" value={item.id} />
                      <label className="text-sm sm:col-span-2">
                        Description
                        <input
                          className="field mt-1"
                          name="description"
                          required
                          defaultValue={item.description}
                          maxLength={120}
                        />
                      </label>
                      <label className="text-sm">
                        Unit $
                        <input
                          className="field mt-1"
                          name="unitPrice"
                          required
                          defaultValue={centsToDollars(item.unitPriceCents).toFixed(2)}
                          inputMode="decimal"
                        />
                      </label>
                      <label className="text-sm">
                        Cost $
                        <input
                          className="field mt-1"
                          name="unitCost"
                          defaultValue={
                            item.unitCostCents
                              ? centsToDollars(item.unitCostCents).toFixed(2)
                              : ""
                          }
                          inputMode="decimal"
                        />
                      </label>
                      <label className="text-sm">
                        Unit
                        <select
                          className="field mt-1"
                          name="unit"
                          defaultValue={parseLineUnit(item.unit)}
                        >
                          <option value="each">each</option>
                          <option value="hours">hours</option>
                          <option value="m2">m²</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        Tax
                        <select className="field mt-1" name="taxCode" defaultValue={item.taxCode}>
                          <option value="GST">GST</option>
                          <option value="GST_FREE">GST-free</option>
                          <option value="BAS_EXCLUDED">BAS excluded</option>
                          <option value="INPUT_TAXED">Input-taxed</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        Amount
                        <select
                          className="field mt-1"
                          name="amountKind"
                          defaultValue={item.amountKind}
                        >
                          <option value="inclusive">Incl</option>
                          <option value="exclusive">Excl</option>
                        </select>
                      </label>
                      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                        <p className="text-sm text-muted">
                          {formatAudFromCents(item.unitPriceCents)} /{" "}
                          {lineUnitLabel(parseLineUnit(item.unit))}
                          {unitMarkupText(item.unitPriceCents, item.unitCostCents)
                            ? ` · ${unitMarkupText(item.unitPriceCents, item.unitCostCents)}`
                            : ""}
                        </p>
                        <button type="submit" className="btn btn-ghost">
                          Save rate
                        </button>
                      </div>
                    </form>
                    <form action={deleteRateItemAction} className="mt-2">
                      <input type="hidden" name="rateItemId" value={item.id} />
                      <button type="submit" className="btn btn-ghost">
                        Delete rate
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form
              action={saveRateItemAction}
              className="mt-6 grid gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-2"
            >
              <p className="text-sm font-semibold sm:col-span-2">Add a rate</p>
              <label className="text-sm sm:col-span-2">
                Description
                <input className="field mt-1" name="description" required maxLength={120} />
              </label>
              <label className="text-sm">
                Unit $
                <input className="field mt-1" name="unitPrice" required inputMode="decimal" />
              </label>
              <label className="text-sm">
                Cost $
                <input className="field mt-1" name="unitCost" inputMode="decimal" />
              </label>
              <label className="text-sm">
                Unit
                <select className="field mt-1" name="unit" defaultValue="each">
                  <option value="each">each</option>
                  <option value="hours">hours</option>
                  <option value="m2">m²</option>
                </select>
              </label>
              <label className="text-sm">
                Tax
                <select className="field mt-1" name="taxCode" defaultValue="GST">
                  <option value="GST">GST</option>
                  <option value="GST_FREE">GST-free</option>
                  <option value="BAS_EXCLUDED">BAS excluded</option>
                  <option value="INPUT_TAXED">Input-taxed</option>
                </select>
              </label>
              <label className="text-sm">
                Amount
                <select className="field mt-1" name="amountKind" defaultValue="inclusive">
                  <option value="inclusive">Incl</option>
                  <option value="exclusive">Excl</option>
                </select>
              </label>
              <div>
                <button type="submit" className="btn btn-ghost">
                  Add rate
                </button>
              </div>
            </form>
          </section>

          <section className="surface p-6" id="create-job-section" data-tour="create-job">
            <h2 className="font-display text-2xl">Create a job</h2>
            <div className="mt-3">
              <FormFillTemplates
                formId="create-job"
                templates={JOB_FORM_TEMPLATES}
                legend="Fill a job template, then create."
              />
            </div>
            <form
              id="create-job"
              action={createJobAction}
              className="mt-4 grid gap-3 sm:grid-cols-2"
            >
              <label className="text-sm sm:col-span-2">
                Existing customer
                <select className="field mt-1" name="customerId" defaultValue="">
                  <option value="">New customer — type name and suburb below</option>
                  {customerList.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} — {customer.suburb}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Customer name
                <input className="field mt-1" name="customerName" maxLength={120} />
              </label>
              <label className="text-sm">
                Suburb
                <input className="field mt-1" name="suburb" maxLength={80} />
              </label>
              <label className="text-sm">
                Phone
                <input className="field mt-1" name="phone" maxLength={40} />
              </label>
              <label className="text-sm">
                Email
                <input className="field mt-1" name="email" maxLength={80} />
              </label>
              <label className="text-sm sm:col-span-2">
                Description
                <textarea className="field mt-1 min-h-20" name="description" required />
              </label>
              <label className="text-sm sm:col-span-2">
                Property
                <input className="field mt-1" name="propertyAddress" maxLength={200} />
              </label>
              <label className="text-sm">
                Vendor
                <input className="field mt-1" name="vendorName" maxLength={120} />
              </label>
              <label className="text-sm">
                Purchaser
                <input className="field mt-1" name="purchaserName" maxLength={120} />
              </label>
              <label className="text-sm sm:col-span-2">
                Report type
                <select className="field mt-1" name="reportType" defaultValue="">
                  {REPORT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value || "none"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                Job notes
                <textarea className="field mt-1 min-h-20" name="notes" maxLength={2000} />
              </label>
              <p className="text-sm text-muted sm:col-span-2">
                Pick an existing customer, or leave that blank and type a name and suburb.
                Phone and email on this form are saved only when creating a new customer.
                Inspection fields print on the quote and invoice. Job notes stay internal.
              </p>
              <div>
                <button type="submit" className="btn btn-primary">
                  Create job
                </button>
              </div>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}
