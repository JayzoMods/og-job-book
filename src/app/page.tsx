import Link from "next/link";
import {
  createJobAction,
  loadDemoAction,
  saveOrgAction,
} from "@/app/actions";
import { OrgAbnLookup } from "@/components/org-abn-lookup";
import { loadDb } from "@/db/ready";
import { listJobs } from "@/db/queries";
import { formatAbn, isValidAbn } from "@/lib/ledger/abn";
import { abrLookupConfigured } from "@/lib/ledger/abr";
import { formatBsb } from "@/lib/ledger/pay";
import { PAYMENT_TERMS_OPTIONS, parsePaymentTermsDays, paymentTermsLabel } from "@/lib/ledger/terms";

const ERRORS: Record<string, string> = {
  db: "Postgres is not connected. Run docker compose up -d, then npm run db:apply.",
  org: "Organisation fields were not valid.",
  job: "Job fields were not valid. Name, suburb, and description are required.",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : "";
  const error = ERRORS[errorKey];
  const state = await loadDb();
  const db = state.ok ? state.db : null;
  const org = state.ok ? state.org : null;
  const jobList = db && org ? await listJobs(db, org.id) : [];
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
              set the due date on new invoices. PayID and BSB are shown on invoices only. We
              do not check the account. This is not Confirmation of Payee and not tax advice.
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
          <section className="surface p-6">
            <h2 className="font-display text-2xl">Create a job</h2>
            <form action={createJobAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Customer name
                <input className="field mt-1" name="customerName" required />
              </label>
              <label className="text-sm">
                Suburb
                <input className="field mt-1" name="suburb" required />
              </label>
              <label className="text-sm sm:col-span-2">
                Description
                <textarea className="field mt-1 min-h-20" name="description" required />
              </label>
              <div>
                <button type="submit" className="btn btn-primary">
                  Create job
                </button>
              </div>
            </form>
          </section>

          <section>
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
