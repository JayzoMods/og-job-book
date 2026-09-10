import { digitsOnly, formatAbn, isValidAbn } from "./abn";
import { formatIsoDateAu } from "./print";

const ABR_ABN_DETAILS = "https://abr.business.gov.au/json/AbnDetails.aspx";
const ABR_TIMEOUT_MS = 8_000;

export type AbrLookup =
  | { status: "skipped"; reason: "no_guid" | "invalid_abn" }
  | { status: "error"; reason: "network" | "http" | "parse" | "abr"; message: string }
  | {
      status: "found";
      abn: string;
      entityName: string;
      abnStatus: string;
      abnStatusEffectiveFrom: string | null;
      gstFrom: string | null;
      entityTypeName: string;
      state: string;
      postcode: string;
    };

export interface AbrLookupOptions {
  guid?: string | null;
  fetchImpl?: typeof fetch;
}

export function abrGuidFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const guid = env.ABR_GUID?.trim();
  return guid ? guid : undefined;
}

export function abrLookupConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(abrGuidFromEnv(env));
}

/**
 * ABR JSON is JSONP (`callback({...})`). Do not eval it.
 * Sample shape from https://abr.business.gov.au/json/ opened 8 Sep 2026.
 */
export function parseAbrJsonp(body: string): unknown {
  const trimmed = body.trim();
  const open = trimmed.indexOf("(");
  const close = trimmed.lastIndexOf(")");
  if (open === -1 || close <= open) {
    throw new Error("ABR response was not JSONP");
  }
  return JSON.parse(trimmed.slice(open + 1, close)) as unknown;
}

function asText(value: unknown): string {
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function optionalDate(value: unknown): string | null {
  const text = asText(value);
  return text === "" ? null : text;
}

function formatAbrDate(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return formatIsoDateAu(match ? match[1] : value);
}

export function describeAbrLookup(lookup: AbrLookup, formattedAbn: string): string {
  const abnLabel = formattedAbn.trim() === "" ? "(empty)" : formattedAbn;

  if (lookup.status === "skipped") {
    if (lookup.reason === "invalid_abn") {
      return `ABN ${abnLabel} does not pass the ABR modulus-89 checksum. Live lookup was not called.`;
    }
    return `ABN ${abnLabel} passes the checksum. Live lookup on the ABR is not available on this site.`;
  }

  if (lookup.status === "error") {
    if (lookup.reason === "abr") {
      return `ABN ${abnLabel} passes the checksum. ABR: ${lookup.message}`;
    }
    return `ABN ${abnLabel} passes the checksum. ABR lookup failed (${lookup.message}). Try again.`;
  }

  const name = lookup.entityName || "name not returned";
  const status = lookup.abnStatus || "status unknown";
  const gst = lookup.gstFrom
    ? `GST registered from ${formatAbrDate(lookup.gstFrom)}.`
    : "ABR does not show a current GST registration.";
  return `ABR: ${name} (${status}). ${gst}`;
}

/** Plain-English mismatch only. Does not change the org GST checkbox. Not tax advice. */
export function describeOrgGstVsAbr(
  lookup: AbrLookup,
  gstRegistered: boolean,
): string | null {
  if (lookup.status !== "found") {
    return null;
  }
  if (gstRegistered && !lookup.gstFrom) {
    return "Your organisation is marked GST registered. ABR does not show a current GST registration. This is not tax advice.";
  }
  if (!gstRegistered && lookup.gstFrom) {
    return `Your organisation is marked not GST registered. ABR shows GST registered from ${formatAbrDate(lookup.gstFrom)}. This is not tax advice.`;
  }
  return null;
}

export async function lookupAbnDetails(
  value: string,
  options: AbrLookupOptions = {},
): Promise<AbrLookup> {
  if (!isValidAbn(value)) {
    return { status: "skipped", reason: "invalid_abn" };
  }

  const guid = options.guid === undefined ? abrGuidFromEnv() : options.guid?.trim();
  if (!guid) {
    return { status: "skipped", reason: "no_guid" };
  }

  const digits = digitsOnly(value);
  const url = new URL(ABR_ABN_DETAILS);
  url.searchParams.set("abn", digits);
  url.searchParams.set("callback", "callback");
  url.searchParams.set("guid", guid);

  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(ABR_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { status: "error", reason: "http", message: `HTTP ${response.status}` };
    }
    const body = await response.text();
    let payload: unknown;
    try {
      payload = parseAbrJsonp(body);
    } catch {
      return { status: "error", reason: "parse", message: "invalid JSONP" };
    }
    if (payload == null || typeof payload !== "object") {
      return { status: "error", reason: "parse", message: "unexpected payload" };
    }

    const record = payload as Record<string, unknown>;
    const message = asText(record.Message);
    const entityName = asText(record.EntityName);
    if (message !== "" && entityName === "") {
      return { status: "error", reason: "abr", message };
    }

    return {
      status: "found",
      abn: asText(record.Abn) || formatAbn(digits),
      entityName,
      abnStatus: asText(record.AbnStatus),
      abnStatusEffectiveFrom: optionalDate(record.AbnStatusEffectiveFrom),
      gstFrom: optionalDate(record.Gst),
      entityTypeName: asText(record.EntityTypeName),
      state: asText(record.AddressState),
      postcode: asText(record.AddressPostcode),
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { status: "error", reason: "network", message: "timed out" };
    }
    return { status: "error", reason: "network", message: "network error" };
  }
}
