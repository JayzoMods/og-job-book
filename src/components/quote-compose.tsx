"use client";

import { useActionState } from "react";
import { createQuoteAction } from "@/app/actions";
import { extractLinesAction, type ExtractLinesState } from "@/app/extract-actions";
import { LineFields } from "@/components/document-panel";

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
}: {
  jobId: string;
  extractConfigured: boolean;
  defaultValidUntil: string;
}) {
  const [extract, extractAction, extractPending] = useActionState(
    extractLinesAction,
    EXTRACT_INITIAL,
  );

  return (
    <article className="surface p-5">
      <h3 className="font-display text-xl">Add quote</h3>
      <p className="mt-2 text-sm text-muted">
        Optional: paste a note or attach a photo to propose line items. The file is not stored.
        Not a chatbot.
      </p>
      {!extractConfigured ? (
        <p className="mt-2 text-sm text-muted">
          Extract is off on this deploy (<code className="font-mono">AI_GATEWAY_API_KEY</code>{" "}
          unset). Type lines below.
        </p>
      ) : null}
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
      <form action={createQuoteAction} className="mt-4 space-y-4">
        <input type="hidden" name="jobId" value={jobId} />
        <LineFields key={JSON.stringify(extract.lines)} lines={extract.lines} />
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
        <button type="submit" className="btn btn-primary">
          Save draft quote
        </button>
      </form>
    </article>
  );
}
