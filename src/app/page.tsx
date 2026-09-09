import Link from "next/link";
import {
  createJobAction,
  deleteRateItemAction,
  issueRecurringAction,
  loadDemoAction,
  saveCustomerAction,
  saveOrgAction,
  saveRateItemAction,
} from "@/app/actions";
import { OrgAbnLookup } from "@/components/org-abn-lookup";
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
import { formatIsoDateAu } from "@/lib/ledger/print";
import {
  parseRecurringFrequency,
  recurringFrequencyLabel,
  recurringIsDue,
} from "@/lib/ledger/recurring";

const ERRORS: Record<string, string> = {
  db: "Postgres is not connected. Run docker compose up -d, then npm run db:apply.",
  org: "Organisation fields were not valid.",
  job: "A job needs a description, and either an existing customer or a name and suburb. Phone, email, and notes are optional. A non-empty email needs an @ and a domain. A non-empty phone needs at least 8 digits.",
  customer:
    "Customer name and suburb are required. Name plus suburb must be unique. Phone and email are optional. A non-empty email needs an @ and a domain. A non-empty phone needs at least 8 digits.",
  rate: "A rate needs a description and a positive unit price. Description plus unit must be unique. Cost is optional; if entered it must be a positive amount.",
  recurring:
    "A recurring invoice needs a cadence, a next issue date, and at least one complete line. The end date cannot be before the next issue date. Issue is manual.",
  statement:
    "Statement dates must be calendar days (YYYY-MM-DD). The from date cannot be after the as-at date.",
  export:
    "Pick JSON, CSV, or BAS Check CSV. Dates must be calendar days. The from date cannot be after the as-at date.",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : "";
  const error = ERRORS[errorKey];
  const state = await loadDb();
  const db = state.ok ? state.db : null;
  const org = state.ok ? state.org : null;
  const jobList = db && org ? await listJobs(db, org.id) : [];
  const customerList = db && org ? await listCustomers(db, org.id) : [];
  const rateList = db && org ? await listRateItems(db, org.id) : [];
  const recurringList = db && org ? await listRecurringForOrg(db, org.id) : [];
  const today = todayIsoSydney();
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <section className="surface p-6 sm:p-8">
        <p className="text-sm font-semibold tracking-wide text-copper">Australian ledger</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">
          Job, quote, invoice — with ABN and GST on the document.
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Narrow hire-repo for a small AU trade or inspection business. No login. Not
          ServiceM8, not a BAS agent, and not tax advice. Click Load demo to seed a
          fictional Sydney inspection org.
        </p>
        <form action={loadDemoAction} className="mt-6">
          <button type="submit" className="btn btn-primary">
            Load demo
          </button>
        </form>
      </section>

      {error ? (
        <p className="rounded-xl border border-error/40 bg-foam px-4 py-3 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      {needsSetup ? (
        <section className="surface p-6">
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

      {db ? (
        <section className="surface p-6">
          <h2 className="font-display text-2xl">Organisation</h2>
          <form action={saveOrgAction} className="mt-4 grid gap-3 sm:grid-cols-2">
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
              set the due date on new invoices. Retention is held on deposit, progress,
              variation, and full invoices when they are issued. PayID and BSB are shown on
              invoices only. We do not check the account. This is not Confirmation of Payee
              and not tax advice.
            </p>
            {org && !isValidAbn(org.abn) ? (
              <p className="text-sm text-warn sm:col-span-2">
                ABN checksum does not match ABR modulus 89. Documents will show that flag.
              </p>
            ) : null}
            <div>
              <button type="submit" className="btn btn-ghost">
                Save organisation
              </button>
            </div>
          </form>
          {org ? (
            <div className="mt-4">
              <OrgAbnLookup
                abn={org.abn}
                gstRegistered={org.gstRegistered}
                lookupConfigured={abrLookupConfigured()}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {db && org ? (
        <>
          <section className="surface p-6" id="customers">
            <h2 className="font-display text-2xl">Customers</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Jobs belong to a customer (name, suburb, optional phone and email).
              The same customer can have more than one job. Print a statement of
              account for the customer — not a tax invoice, not a BAS. Job notes are
              internal and are not printed. Shown as given — this app does not call,
              SMS, or send email. Not a customer portal.
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

          <section className="surface p-6" id="export">
            <h2 className="font-display text-2xl">Export</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Download the books as JSON or CSV. The BAS Check CSV is sales lines
              (invoices and credit notes) in BAS Check column order so you can drop
              the file into that app. This is not a GST risk checker, not a bulk ABR
              lookup, not Xero, and not a BAS. Job notes and cost are not exported.
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

          <section className="surface p-6">
            <h2 className="font-display text-2xl">Rate card</h2>
            <p className="mt-2 text-sm text-muted">
              Sell prices for this organisation, with optional cost. Markup is (sell − cost) ÷
              cost. Cost is not printed. Not inventory.
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

          <section className="surface p-6">
            <h2 className="font-display text-2xl">Create a job</h2>
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
                Job notes
                <textarea className="field mt-1 min-h-20" name="notes" maxLength={2000} />
              </label>
              <p className="text-sm text-muted sm:col-span-2">
                Pick an existing customer, or leave that blank and type a name and
                suburb. Phone and email on this form are saved only when creating a
                new customer. Job notes are internal and are not printed.
              </p>
              <div>
                <button type="submit" className="btn btn-primary">
                  Create job
                </button>
              </div>
            </form>
          </section>

          <section>
            {dueRecurring.length > 0 ? (
              <section className="mb-8">
                <h2 className="font-display text-2xl">Due recurring invoices</h2>
                <p className="mt-2 text-sm text-muted">
                  Issue is manual. This is not a booking calendar and the invoice is not
                  emailed.
                </p>
                <ul className="mt-4 grid gap-3">
                  {dueRecurring.map((row) => {
                    const cadence = parseRecurringFrequency(row.frequency);
                    return (
                      <li
                        key={row.id}
                        className="surface flex flex-wrap items-center justify-between gap-3 p-4"
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
            <h2 className="font-display text-2xl">Jobs</h2>
            {jobList.length === 0 ? (
              <p className="mt-3 text-muted">No jobs yet. Load demo or create one.</p>
            ) : (
              <ul className="mt-4 grid gap-3">
                {jobList.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="surface flex flex-wrap items-center justify-between gap-3 p-4 hover:border-navy"
                    >
                      <div>
                        <p className="font-semibold">{job.customerName}</p>
                        <p className="text-sm text-muted">
                          {job.suburb} · {job.description}
                        </p>
                      </div>
                      <span className="pill">{job.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
