import Link from "next/link";
import { GstCell } from "@/components/document-panel";
import { PrintSampleMark } from "@/components/print-sample-mark";
import { formatAbn, isValidAbn } from "@/lib/ledger/abn";
import { formatAudFromCents } from "@/lib/ledger/money";
import { formatIsoDateAu, printDocumentTitle, type PrintKind } from "@/lib/ledger/print";
import { formatLineQuantity, taxCodeLabel, type DocumentTotals } from "@/lib/ledger/tax";
import { PrintButton } from "@/components/print-button";

export function PrintSheet({
  kind,
  jobHref,
  docNumber,
  status,
  statusLabel,
  issuedLabel,
  orgName,
  orgAddress,
  abn,
  gstRegistered,
  customerName,
  suburb,
  customerPhone,
  customerEmail,
  jobDescription,
  inspectionLines,
  totals,
  dueDate,
  paidCents,
  creditedCents,
  validUntil,
  paymentTermsLabel,
  notice,
  payLines,
  againstLabel,
  reason,
  kindLine,
  retentionHeldCents,
  amountDueCents,
  sampleMark = false,
}: {
  kind: PrintKind;
  jobHref?: string;
  docNumber: string;
  status: string;
  statusLabel?: string;
  issuedLabel?: string;
  orgName: string;
  orgAddress: string;
  abn: string;
  gstRegistered: boolean;
  customerName: string;
  suburb: string;
  customerPhone?: string;
  customerEmail?: string;
  jobDescription: string;
  inspectionLines?: Array<{ label: string; value: string }>;
  totals: DocumentTotals;
  dueDate?: string;
  paidCents?: number;
  creditedCents?: number;
  validUntil?: string;
  paymentTermsLabel?: string;
  notice?: string;
  payLines?: Array<{ label: string; value: string }>;
  againstLabel?: string;
  reason?: string;
  kindLine?: string;
  retentionHeldCents?: number;
  amountDueCents?: number;
  sampleMark?: boolean;
}) {
  const title = printDocumentTitle({ kind, docNumber, status, gstRegistered });
  const abnOk = isValidAbn(abn);

  return (
    <div className="print-page mx-auto flex w-full max-w-[210mm] flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="print-toolbar flex flex-wrap items-center justify-between gap-3">
        {jobHref ? (
          <Link href={jobHref} className="text-sm text-navy underline-offset-2 hover:underline">
            ← Back to job
          </Link>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">A4. In the dialog, choose Save as PDF.</p>
          <PrintButton />
        </div>
      </div>

      <article className="print-sheet">
        {sampleMark ? <PrintSampleMark /> : null}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#c9c1b3] pb-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[#8a5420] uppercase">
              OG Job Book
            </p>
            <h1 className="mt-1 font-display text-3xl text-[#1b2430]">{title}</h1>
            {issuedLabel ? <p className="mt-1 text-sm text-[#4b5563]">{issuedLabel}</p> : null}
          </div>
          <p className="text-sm font-semibold capitalize text-[#1b2430]">
            {statusLabel ?? status}
          </p>
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
            {customerPhone ? (
              <p className="text-sm text-[#4b5563]">Phone {customerPhone}</p>
            ) : null}
            {customerEmail ? (
              <p className="text-sm text-[#4b5563]">Email {customerEmail}</p>
            ) : null}
            <p className="mt-2 text-sm text-[#1b2430]">{jobDescription}</p>
            {inspectionLines?.map((line) => (
              <p key={line.label} className="mt-1 text-sm text-[#4b5563]">
                {line.label} {line.value}
              </p>
            ))}
            {againstLabel ? (
              <p className="mt-2 text-sm text-[#1b2430]">Against {againstLabel}</p>
            ) : null}
            {kindLine ? <p className="mt-2 text-sm text-[#1b2430]">{kindLine}</p> : null}
            {reason ? <p className="mt-1 text-sm text-[#4b5563]">Reason: {reason}</p> : null}
          </div>
        </section>

        <table className="mt-8 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#c9c1b3] text-[#4b5563]">
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="py-2 pr-3 font-medium">Qty</th>
              <th className="py-2 pr-3 font-medium">Unit $</th>
              <th className="py-2 pr-3 font-medium">Tax</th>
              <th className="py-2 text-right font-medium">GST</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {totals.lines.map((line, index) => (
              <tr key={`${line.description}-${index}`} className="border-b border-[#e6e0d4]">
                <td className="py-2 pr-3">{line.description}</td>
                <td className="py-2 pr-3 font-mono">{formatLineQuantity(line.quantity, line.unit)}</td>
                <td className="py-2 pr-3 font-mono">{formatAudFromCents(line.unitPriceCents)}</td>
                <td className="py-2 pr-3">{taxCodeLabel(line.taxCode)}</td>
                <td className="py-2 text-right font-mono">
                  <GstCell
                    line={line}
                    gstRegistered={gstRegistered}
                    proofClassName="mt-0.5 block text-xs text-[#4b5563]"
                  />
                </td>
                <td className="py-2 text-right font-mono">{formatAudFromCents(line.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[#4b5563]">GST</dt>
            <dd className="font-mono">{formatAudFromCents(totals.gstCents)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#4b5563]">GST-free</dt>
            <dd className="font-mono">{formatAudFromCents(totals.gstFreeCents)}</dd>
          </div>
          {totals.otherCents > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Other</dt>
              <dd className="font-mono">{formatAudFromCents(totals.otherCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-[#c9c1b3] pt-2 font-semibold">
            <dt>Total</dt>
            <dd className="font-mono">{formatAudFromCents(totals.totalCents)}</dd>
          </div>
          {kind === "invoice" && retentionHeldCents !== undefined && retentionHeldCents > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Retention held</dt>
              <dd className="font-mono">{formatAudFromCents(retentionHeldCents)}</dd>
            </div>
          ) : null}
          {kind === "invoice" && amountDueCents !== undefined && retentionHeldCents ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Amount due</dt>
              <dd className="font-mono">{formatAudFromCents(amountDueCents)}</dd>
            </div>
          ) : null}
          {kind === "quote" && validUntil ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Valid until</dt>
              <dd>{formatIsoDateAu(validUntil)}</dd>
            </div>
          ) : null}
          {kind === "invoice" && paymentTermsLabel ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Payment terms</dt>
              <dd>{paymentTermsLabel}</dd>
            </div>
          ) : null}
          {kind === "invoice" && dueDate ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Due</dt>
              <dd>{formatIsoDateAu(dueDate)}</dd>
            </div>
          ) : null}
          {kind === "invoice" && paidCents !== undefined ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Recorded</dt>
              <dd className="font-mono">{formatAudFromCents(paidCents)}</dd>
            </div>
          ) : null}
          {kind === "invoice" && creditedCents !== undefined && creditedCents > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#4b5563]">Credited</dt>
              <dd className="font-mono">{formatAudFromCents(creditedCents)}</dd>
            </div>
          ) : null}
        </dl>

        {kind === "invoice" && payLines && payLines.length > 0 ? (
          <section className="mt-8 max-w-sm">
            <h2 className="text-xs font-semibold tracking-wide text-[#8a5420] uppercase">
              Pay
            </h2>
            <dl className="mt-2 space-y-1 text-sm">
              {payLines.map((line) => (
                <div key={line.label} className="flex justify-between gap-4">
                  <dt className="text-[#4b5563]">{line.label}</dt>
                  <dd className="font-mono text-[#1b2430]">{line.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-[#4b5563]">
              Shown as entered. Not Confirmation of Payee — we do not check the account.
            </p>
          </section>
        ) : null}

        {notice ? <p className="mt-6 text-sm text-[#9a3b08]">{notice}</p> : null}

        {totals.flags.length > 0 ? (
          <ul className="mt-6 space-y-1 text-sm text-[#9a3b08]">
            {totals.flags.map((flag) => (
              <li key={`${flag.code}-${flag.message}`}>{flag.message}</li>
            ))}
          </ul>
        ) : null}

        <p className="mt-10 text-xs text-[#4b5563]">
          {kind === "credit"
            ? gstRegistered
              ? "This credit note reduces the amount owing on the named invoice. Inclusive GST is 1/11 of the line total, nearest cent. Exclusive GST is 10%. This is not tax advice, and it does not lodge with the ATO. Amounts are AUD."
              : "This credit note reduces the amount owing on the named invoice. This organisation is not GST registered, so GST is not charged. This is not tax advice, and it does not lodge with the ATO. Amounts are AUD."
            : gstRegistered
              ? "Inclusive GST is 1/11 of the line total, nearest cent. Exclusive GST is 10%. Retention is a hold of billed amounts, not a GST adjustment. This is not tax advice, and it does not lodge with the ATO. Amounts are AUD."
              : "This organisation is not GST registered, so GST is not charged. Retention is a hold of billed amounts, not a GST adjustment. This is not tax advice, and it does not lodge with the ATO. Amounts are AUD."}
        </p>
      </article>
    </div>
  );
}
