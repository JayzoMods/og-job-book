"use client";

import { useActionState } from "react";
import { createQuoteAction } from "@/app/actions";
import { extractLinesAction, type ExtractLinesState } from "@/app/extract-actions";
import { LineFields } from "@/components/document-panel";
import { PendingSubmit } from "@/components/pending-submit";
import { formatAudFromCents } from "@/lib/ledger/money";
import { unitMarkupText } from "@/lib/ledger/markup";
import { lineUnitLabel, parseLineUnit } from "@/lib/ledger/tax";

const EXTRACT_INITIAL: ExtractLinesState = {
  ok: true,
  skipped: false,
  lines: [],
  messages: [],
  error: null,
};

export function QuoteCompose({
  jobId,
  extractConfigured,
  defaultValidUntil,
  rateItems,
}: {
  jobId: string;
  extractConfigured: boolean;
  defaultValidUntil: string;
  rateItems: Array<{
    id: string;
    description: string;
    unit: string;
    unitPriceCents: number;
    unitCostCents?: number | null;
    taxCode: string;
  }>;
}) {
  const [extract, extractAction, extractPending] = useActionState(
    extractLinesAction,
    EXTRACT_INITIAL,
  );

  return (
    <article className="surface p-5">
      <p className="kicker">New document</p>
      <h3 className="mt-2 font-display text-xl">Add quote</h3>
      {extractConfigured ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Optional: paste a note or attach a photo to propose line items. The file is not
            stored.
          </p>
          <form action={extractAction} className="mt-4 space-y-3" aria-busy={extractPending}>
            <input type="hidden" name="jobId" value={jobId} />
            <label className="block text-sm">
              Note
              <textarea
                className="field mt-1 min-h-20"
                name="note"
                maxLength={4000}
                placeholder="e.g. Pre-purchase inspection $1,210 incl GST, first-aid booklet $22 GST-free"
              />
            </label>
            <label className="block text-sm">
              Photo
              <input
                className="field mt-1"
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
              />
            </label>
            <button type="submit" className="btn btn-ghost" disabled={extractPending}>
              {extractPending ? "Reading…" : "Propose lines"}
            </button>
          </form>
          {extract.error ? (
            <p className="mt-3 text-sm text-error" role="alert">
              {extract.error}
            </p>
          ) : null}
          {extract.messages.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {extract.messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <form action={createQuoteAction} className="mt-4 space-y-4">
        <input type="hidden" name="jobId" value={jobId} />
        {rateItems.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Rate card</legend>
            <p className="text-sm text-muted">
              Tick a rate to drop it onto this quote as qty 1. You can still type extra
              lines. Cost comes with the rate when set. Not printed.
            </p>
            <ul className="space-y-1">
              {rateItems.map((item) => (
                <li key={item.id}>
                  <label className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="checkbox" name="rateItemId" value={item.id} />
                    <span>
                      {item.description} · {formatAudFromCents(item.unitPriceCents)} /{" "}
                      {lineUnitLabel(parseLineUnit(item.unit))}
                      {item.unitCostCents
                        ? ` · ${unitMarkupText(item.unitPriceCents, item.unitCostCents)}`
                        : ""}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : (
          <p className="text-sm text-muted">
            No rates yet. Add a rate card on the home page, then drop items here.
          </p>
        )}
        <LineFields key={JSON.stringify(extract.lines)} lines={extract.lines} showCost />
        <label className="block text-sm">
          Valid until
          <input
            className="field mt-1"
            type="date"
            name="valid_until"
            required
            defaultValue={defaultValidUntil}
          />
        </label>
        <PendingSubmit
          idle="Save draft quote"
          busy="Saving…"
          className="btn btn-primary"
        />
      </form>
    </article>
  );
}
