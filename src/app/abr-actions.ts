"use server";

import { formatAbn } from "@/lib/ledger/abn";
import {
  describeAbrLookup,
  describeOrgGstVsAbr,
  lookupAbnDetails,
} from "@/lib/ledger/abr";

export type LookupOrgAbnState = {
  ok: boolean;
  skipped: boolean;
  messages: string[];
  flags: string[];
  error: string | null;
};

export async function lookupOrgAbnAction(
  _prev: LookupOrgAbnState,
  formData: FormData,
): Promise<LookupOrgAbnState> {
  const abn = String(formData.get("abn") ?? "");
  const gstRegistered = formData.get("gstRegistered") === "yes";
  const lookup = await lookupAbnDetails(abn);
  const formatted = formatAbn(abn);
  const mismatch = describeOrgGstVsAbr(lookup, gstRegistered);

  return {
    ok: true,
    skipped: lookup.status === "skipped",
    messages: [describeAbrLookup(lookup, formatted)],
    flags: mismatch ? [mismatch] : [],
    error: null,
  };
}
