import type { ReactNode } from "react";
import { formatAbn, isValidAbn } from "@/lib/ledger/abn";
import { centsToDollars, formatAudFromCents } from "@/lib/ledger/money";
import { taxCodeLabel, gstProofLabel, formatLineQuantity, parseLineUnit, type ComputedLine, type DocumentTotals } from "@/lib/ledger/tax";

export function DocumentPanel({
  title,
  status,
  abn,
  gstRegistered,
  totals,
  extra,
  children,
}: {
  title: string;
  status: string;
  abn: string;
  gstRegistered: boolean;
  totals: DocumentTotals;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const abnOk = isValidAbn(abn);
  return (
    <article className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl">{title}</h3>
          <p className="mt-1 text-sm text-muted">
            ABN {abn ? formatAbn(abn) : "not set"}
            {abnOk ? "" : " — checksum does not match ABR modulus 89"}
            {gstRegistered ? "" : " · GST not registered on the org"}
          </p>
        </div>
        <span className="pill">{status}</span>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
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
              <tr key={`${line.description}-${index}`} className="border-b border-line/70">
                <td className="py-2 pr-3">{line.description}</td>
                <td className="py-2 pr-3 font-mono">{formatLineQuantity(line.quantity, line.unit)}</td>
                <td className="py-2 pr-3 font-mono">{formatAudFromCents(line.unitPriceCents)}</td>
                <td className="py-2 pr-3">{taxCodeLabel(line.taxCode)}</td>
                <td className="py-2 text-right font-mono">
                  <GstCell line={line} gstRegistered={gstRegistered} />
                </td>
                <td className="py-2 text-right font-mono">{formatAudFromCents(line.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">GST</dt>
          <dd className="font-mono">{formatAudFromCents(totals.gstCents)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">GST-free</dt>
          <dd className="font-mono">{formatAudFromCents(totals.gstFreeCents)}</dd>
        </div>
        {totals.otherCents > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Other (BAS excluded / input-taxed)</dt>
            <dd className="font-mono">{formatAudFromCents(totals.otherCents)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 font-semibold">
          <dt>Total</dt>
          <dd className="font-mono">{formatAudFromCents(totals.totalCents)}</dd>
        </div>
      </dl>
      {totals.flags.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm text-warn">
          {totals.flags.map((flag) => (
            <li key={`${flag.code}-${flag.message}`}>{flag.message}</li>
          ))}
        </ul>
      ) : null}
      {extra ? <div className="mt-4">{extra}</div> : null}
      {children ? <div className="mt-4 flex flex-wrap gap-2">{children}</div> : null}
    </article>
  );
}

export function GstCell({
  line,
  gstRegistered,
  proofClassName = "mt-0.5 block text-xs text-muted",
}: {
  line: ComputedLine;
  gstRegistered: boolean;
  proofClassName?: string;
}) {
  const proof = gstRegistered ? gstProofLabel(line) : null;
  return (
    <>
      {formatAudFromCents(line.gstCents)}
      {proof ? <span className={proofClassName}>{proof}</span> : null}
    </>
  );
}

export function LineFields({
  lines = [],
}: {
  lines?: Array<{
    description: string;
    quantity: number;
    unit?: string;
    unitPriceCents: number;
    taxCode: string;
    amountKind: string;
  }>;
}) {
  const slotCount = Math.max(4, lines.length + 1);
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Line items</legend>
      <p className="text-sm text-muted">
        Empty rows are ignored. Qty is each, hours, or m². Unit price is in AUD.
      </p>
      {Array.from({ length: slotCount }, (_, slot) => {
        const line = lines[slot];
        return (
          <div key={slot} className="grid gap-2 sm:grid-cols-12">
            <label className="sm:col-span-12">
              <span className="sr-only">Description {slot + 1}</span>
              <input
                className="field"
                name="line_description"
                placeholder={`Description ${slot + 1}`}
                defaultValue={line?.description ?? ""}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="sr-only">Quantity {slot + 1}</span>
              <input
                className="field"
                name="line_qty"
                placeholder="Qty"
                defaultValue={
                  line ? String(line.quantity) : slot === 0 && lines.length === 0 ? "1" : ""
                }
                inputMode="decimal"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="sr-only">Unit {slot + 1}</span>
              <select
                className="field"
                name="line_unit"
                defaultValue={parseLineUnit(line?.unit)}
              >
                <option value="each">each</option>
                <option value="hours">hours</option>
                <option value="m2">m²</option>
              </select>
            </label>
            <label className="sm:col-span-3">
              <span className="sr-only">Unit price {slot + 1}</span>
              <input
                className="field"
                name="line_price"
                placeholder="Unit $"
                defaultValue={line ? centsToDollars(line.unitPriceCents).toFixed(2) : ""}
                inputMode="decimal"
              />
            </label>
            <label className="sm:col-span-3">
              <span className="sr-only">Tax code {slot + 1}</span>
              <select className="field" name="line_tax" defaultValue={line?.taxCode ?? "GST"}>
                <option value="GST">GST</option>
                <option value="GST_FREE">GST-free</option>
                <option value="BAS_EXCLUDED">BAS excluded</option>
                <option value="INPUT_TAXED">Input-taxed</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="sr-only">Amount kind {slot + 1}</span>
              <select
                className="field"
                name="line_kind"
                defaultValue={line?.amountKind ?? "inclusive"}
              >
                <option value="inclusive">Incl</option>
                <option value="exclusive">Excl</option>
              </select>
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
