import Link from "next/link";
import { formatAbn, isValidAbn } from "@/lib/ledger/abn";
import { formatAudFromCents } from "@/lib/ledger/money";
import { formatIsoDateAu, printRemittanceTitle, printStatementTitle } from "@/lib/ledger/print";
import {
  ageBucketLabel,
  type RemittanceAdvice,
  type StatementRow,
  type StatementTotals,
} from "@/lib/ledger/statement";
import { PrintButton } from "@/components/print-button";

function OrgCustomerHeader({
  title,
  issuedLabel,
  orgName,
  orgAddress,
  abn,
  gstRegistered,
  customerName,
  suburb,
  customerPhone,
  customerEmail,
}: {
  title: string;
  issuedLabel: string;
  orgName: string;
  orgAddress: string;
  abn: string;
  gstRegistered: boolean;
  customerName: string;
  suburb: string;
  customerPhone?: string;
  customerEmail?: string;
}) {
  const abnOk = isValidAbn(abn);
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#c9c1b3] pb-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-[#8a5420] uppercase">
            OG Job Book
          </p>
          <h1 className="mt-1 font-display text-3xl text-[#1b2430]">{title}</h1>
          <p className="mt-1 text-sm text-[#4b5563]">{issuedLabel}</p>
        </div>
      </header>

      <section className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-[#8a5420] uppercase">From</h2>
          <p className="mt-1 font-semibold text-[#1b2430]">{orgName}</p>
          <p className="text-sm text-[#4b5563]">{orgAddress}</p>
          <p className="mt-2 text-sm text-[#1b2430]">
            ABN {abn ? formatAbn(abn) : "not set"}
            {abnOk ? "" : " — checksum does not match ABR modulus 89"}
          </p>
          <p className="text-sm text-[#4b5563]">
            {gstRegistered ? "GST registered" : "Not GST registered"}
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-[#8a5420] uppercase">To</h2>
          <p className="mt-1 font-semibold text-[#1b2430]">{customerName}</p>
          <p className="text-sm text-[#4b5563]">{suburb}</p>
          {customerPhone ? <p className="text-sm text-[#4b5563]">Phone {customerPhone}</p> : null}
          {customerEmail ? <p className="text-sm text-[#4b5563]">Email {customerEmail}</p> : null}
        </div>
      </section>
    </>
  );
}

export function StatementSheet({
  backHref,
  backLabel,
  asAt,
  from,
  orgName,
  orgAddress,
  abn,
  gstRegistered,
  customerName,
  suburb,
  customerPhone,
  customerEmail,
  rows,
  totals,
  payLines,
}: {
  backHref: string;
  backLabel: string;
  asAt: string;
  from: string | null;
  orgName: string;
  orgAddress: string;
  abn: string;
  gstRegistered: boolean;
  customerName: string;
  suburb: string;
  customerPhone?: string;
  customerEmail?: string;
  rows: StatementRow[];
  totals: StatementTotals;
  payLines: Array<{ label: string; value: string }>;
}) {
  const period =
    from === null
      ? `As at ${formatIsoDateAu(asAt)}`
      : `From ${formatIsoDateAu(from)} to ${formatIsoDateAu(asAt)}`;

  return (
    <div className="print-page mx-auto flex w-full max-w-[210mm] flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="print-toolbar flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-sm text-navy underline-offset-2 hover:underline">
          ← {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">A4. In the dialog, choose Save as PDF.</p>
          <PrintButton />
        </div>
      </div>

      <article className="print-sheet">
        <OrgCustomerHeader
          title={printStatementTitle()}
          issuedLabel={period}
          orgName={orgName}
          orgAddress={orgAddress}
          abn={abn}
          gstRegistered={gstRegistered}
          customerName={customerName}
          suburb={suburb}
          customerPhone={customerPhone}
          customerEmail={customerEmail}
        />

        <table className="mt-8 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#c9c1b3] text-[#4b5563]">
              <th className="py-2 pr-3 font-medium">Document</th>
              <th className="py-2 pr-3 font-medium">Issued</th>
              <th className="py-2 pr-3 font-medium">Due</th>
              <th className="py-2 pr-3 text-right font-medium">Total</th>
              <th className="py-2 pr-3 text-right font-medium">Paid</th>
              <th className="py-2 pr-3 text-right font-medium">Credited</th>
              <th className="py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-4 text-[#4b5563]" colSpan={7}>
                  No invoices in this period.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.invoiceId} className="border-b border-[#e6e0d4]">
                  <td className="py-2 pr-3">
                    <p>{row.docNumber}</p>
                    <p className="text-xs text-[#4b5563]">
                      {row.kindLabel}
                      {row.jobDescription ? ` · ${row.jobDescription}` : ""}
                    </p>
                    {row.overdue ? <p className="text-xs text-[#9a3b08]">Overdue</p> : null}
                  </td>
                  <td className="py-2 pr-3">{formatIsoDateAu(row.issuedOn)}</td>
                  <td className="py-2 pr-3">{formatIsoDateAu(row.dueDate)}</td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {formatAudFromCents(row.totalCents)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {formatAudFromCents(row.paidCents)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {formatAudFromCents(row.creditedCents)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {formatAudFromCents(row.remainingCents)}
                    {row.age ? (
                      <p className="text-xs font-sans font-normal text-[#4b5563]">
                        {ageBucketLabel(row.age)}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <dl className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[#4b5563]">Billed</dt>
            <dd className="font-mono">{formatAudFromCents(totals.billedCents)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#4b5563]">Paid</dt>
            <dd className="font-mono">{formatAudFromCents(totals.paidCents)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#4b5563]">Credited</dt>
            <dd className="font-mono">{formatAudFromCents(totals.creditedCents)}</dd>
          </div>
          {totals.retentionHeldCents > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Retention held</dt>
              <dd className="font-mono">{formatAudFromCents(totals.retentionHeldCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-[#c9c1b3] pt-2 font-semibold">
            <dt>Amount owing</dt>
            <dd className="font-mono">{formatAudFromCents(totals.remainingCents)}</dd>
          </div>
          <div className="flex justify-between gap-4 pt-2 text-[#4b5563]">
            <dt>Current</dt>
            <dd className="font-mono">{formatAudFromCents(totals.currentCents)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-[#4b5563]">
            <dt>1–30 days</dt>
            <dd className="font-mono">{formatAudFromCents(totals.days1to30Cents)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-[#4b5563]">
            <dt>31–60 days</dt>
            <dd className="font-mono">{formatAudFromCents(totals.days31to60Cents)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-[#4b5563]">
            <dt>61–90 days</dt>
            <dd className="font-mono">{formatAudFromCents(totals.days61to90Cents)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-[#4b5563]">
            <dt>90+ days</dt>
            <dd className="font-mono">{formatAudFromCents(totals.days90plusCents)}</dd>
          </div>
        </dl>

        {totals.remainingCents > 0 && payLines.length > 0 ? (
          <section className="mt-8 max-w-sm">
            <h2 className="text-xs font-semibold tracking-wide text-[#8a5420] uppercase">Pay</h2>
            <dl className="mt-2 space-y-1 text-sm">
              {payLines.map((line) => (
                <div key={line.label} className="flex justify-between gap-4">
                  <dt className="text-[#4b5563]">{line.label}</dt>
                  <dd className="font-mono text-[#1b2430]">{line.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-[#4b5563]">
              Shown as given. Not Confirmation of Payee. We do not check this account.
            </p>
          </section>
        ) : null}

        <p className="mt-10 text-xs text-[#4b5563]">
          This is a statement of account, not a tax invoice. Amount owing is after recorded
          payments, credits, and retention held as at the date above. Retention is a hold, not a
          GST adjustment. This is not tax advice and does not lodge a BAS.
          Payee. Amounts are AUD.
        </p>
      </article>
    </div>
  );
}

export function RemittanceSheet({
  jobHref,
  orgName,
  orgAddress,
  abn,
  gstRegistered,
  customerName,
  suburb,
  customerPhone,
  customerEmail,
  jobDescription,
  advice,
}: {
  jobHref: string;
  orgName: string;
  orgAddress: string;
  abn: string;
  gstRegistered: boolean;
  customerName: string;
  suburb: string;
  customerPhone?: string;
  customerEmail?: string;
  jobDescription: string;
  advice: RemittanceAdvice;
}) {
  return (
    <div className="print-page mx-auto flex w-full max-w-[210mm] flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="print-toolbar flex flex-wrap items-center justify-between gap-3">
        <Link href={jobHref} className="text-sm text-navy underline-offset-2 hover:underline">
          ← Back to job
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">A4. In the dialog, choose Save as PDF.</p>
          <PrintButton />
        </div>
      </div>

      <article className="print-sheet">
        <OrgCustomerHeader
          title={printRemittanceTitle()}
          issuedLabel={`${advice.methodLabel} · ${formatIsoDateAu(advice.paidOn)}`}
          orgName={orgName}
          orgAddress={orgAddress}
          abn={abn}
          gstRegistered={gstRegistered}
          customerName={customerName}
          suburb={suburb}
          customerPhone={customerPhone}
          customerEmail={customerEmail}
        />

        <p className="mt-6 text-sm text-[#1b2430]">{jobDescription}</p>

        <table className="mt-8 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#c9c1b3] text-[#4b5563]">
              <th className="py-2 pr-3 font-medium">Invoice</th>
              <th className="py-2 pr-3 text-right font-medium">Invoice total</th>
              <th className="py-2 pr-3 text-right font-medium">This payment</th>
              <th className="py-2 pr-3 text-right font-medium">Recorded</th>
              <th className="py-2 text-right font-medium">Remaining</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#e6e0d4]">
              <td className="py-2 pr-3">{advice.invoiceDocNumber}</td>
              <td className="py-2 pr-3 text-right font-mono">
                {formatAudFromCents(advice.invoiceTotalCents)}
              </td>
              <td className="py-2 pr-3 text-right font-mono">
                {formatAudFromCents(advice.amountCents)}
              </td>
              <td className="py-2 pr-3 text-right font-mono">
                {formatAudFromCents(advice.recordedCents)}
              </td>
              <td className="py-2 text-right font-mono">
                {formatAudFromCents(advice.remainingCents)}
              </td>
            </tr>
          </tbody>
        </table>

        <dl className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          {advice.creditedCents > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Credited</dt>
              <dd className="font-mono">{formatAudFromCents(advice.creditedCents)}</dd>
            </div>
          ) : null}
          {advice.retentionHeldCents > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Retention held</dt>
              <dd className="font-mono">{formatAudFromCents(advice.retentionHeldCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-[#c9c1b3] pt-2 font-semibold">
            <dt>This payment</dt>
            <dd className="font-mono">{formatAudFromCents(advice.amountCents)}</dd>
          </div>
        </dl>

        <p className="mt-10 text-xs text-[#4b5563]">
          This remittance advice records a payment entered in OG Job Book. It is not a tax invoice,
          not a credit note, not Confirmation of Payee, and not a refund. We do not check the
          account. This is not tax advice and does not lodge a BAS. Amounts are AUD.
        </p>
      </article>
    </div>
  );
}
