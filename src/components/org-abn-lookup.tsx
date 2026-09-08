"use client";

import { useActionState } from "react";
import { lookupOrgAbnAction, type LookupOrgAbnState } from "@/app/abr-actions";
import { formatAbn } from "@/lib/ledger/abn";

const LOOKUP_INITIAL: LookupOrgAbnState = {
  ok: true,
  skipped: false,
  messages: [],
  flags: [],
  error: null,
};

export function OrgAbnLookup({
  abn,
  gstRegistered,
  lookupConfigured,
}: {
  abn: string;
  gstRegistered: boolean;
  lookupConfigured: boolean;
}) {
  const [lookup, lookupAction, lookupPending] = useActionState(
    lookupOrgAbnAction,
    LOOKUP_INITIAL,
  );
  const formatted = abn ? formatAbn(abn) : "not set";

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        Live ABR lookup checks the saved organisation ABN only (one ABN, not a bulk list). It
        does not change the GST registered checkbox. This is not tax advice.
      </p>
      {!lookupConfigured ? (
        <p className="text-sm text-muted">
          Live ABR lookup is off on this deploy (<code className="font-mono">ABR_GUID</code>{" "}
          unset). Checksum still runs.
        </p>
      ) : null}
      <form action={lookupAction} className="flex flex-wrap items-center gap-3" aria-busy={lookupPending}>
        <input type="hidden" name="abn" value={abn} />
        <input type="hidden" name="gstRegistered" value={gstRegistered ? "yes" : "no"} />
        <button type="submit" className="btn btn-ghost" disabled={lookupPending}>
          {lookupPending ? "Looking up…" : "Look up ABN on ABR"}
        </button>
        <span className="text-sm text-muted">Saved ABN {formatted}</span>
      </form>
      {lookup.error ? (
        <p className="text-sm text-error" role="alert">
          {lookup.error}
        </p>
      ) : null}
      {lookup.messages.length > 0 ? (
        <ul className="space-y-1 text-sm text-muted">
          {lookup.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      {lookup.flags.length > 0 ? (
        <ul className="space-y-1 text-sm text-warn">
          {lookup.flags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
