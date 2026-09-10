import { randomBytes as nodeRandomBytes } from "node:crypto";
import { z } from "zod";

export const SHARE_TOKEN_BYTES = 32;
export const SHARE_TOKEN_LENGTH = 43;
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const QUOTE_SHARE_NOTE =
  "A sent quote can be opened at /q/{token} without the job URL. Drafts are not shared. Accept and decline work on the link for a sent quote. Not a customer portal. Not an invoice.";

export const SHAREABLE_QUOTE_STATUSES = [
  "sent",
  "accepted",
  "declined",
  "superseded",
] as const;

export type QuoteShareSkipReason = "not_shareable" | "missing";

export type ParseQuoteShareResult =
  | { ok: true; payload: { quoteId: string; rotate: boolean } }
  | { ok: false; issues: string[] };

const payloadSchema = z.object({
  quoteId: z.string().uuid(),
  rotate: z.boolean().optional(),
});

export type ShareTokenBytes = (size: number) => Buffer;

/** Empty, whitespace, wrong length, and non-base64url are rejected. */
export function parseShareToken(raw: string | number | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "" || trimmed.length !== SHARE_TOKEN_LENGTH) {
    return null;
  }
  if (!SHARE_TOKEN_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function generateShareToken(
  randomBytesImpl: ShareTokenBytes = nodeRandomBytes,
): string {
  const token = randomBytesImpl(SHARE_TOKEN_BYTES).toString("base64url");
  const parsed = parseShareToken(token);
  if (!parsed) {
    throw new Error("share token encode failed");
  }
  return parsed;
}

export function quoteSharePath(token: string): string {
  const parsed = parseShareToken(token);
  return parsed ? `/q/${parsed}` : "";
}

export function quoteShareUrl(origin: string, token: string): string {
  const path = quoteSharePath(token);
  if (path === "") {
    return "";
  }
  const base = origin.trim().replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

export function canShareQuote(status: string): boolean {
  return (SHAREABLE_QUOTE_STATUSES as readonly string[]).includes(status);
}

export function canRespondToSharedQuote(status: string): boolean {
  return status === "sent";
}

export function quoteShareSkipReason(input: {
  status: string;
}): QuoteShareSkipReason | null {
  if (!canShareQuote(input.status)) {
    return "not_shareable";
  }
  return null;
}

export function describeQuoteShareSkip(reason: QuoteShareSkipReason): string {
  if (reason === "missing") {
    return "That share link is not here.";
  }
  return "Only a sent, accepted, declined, or superseded quote has a share link. Drafts stay in this ledger.";
}

export function resolveShareToken(input: {
  existing: string | null | undefined;
  rotate: boolean;
  randomBytesImpl?: ShareTokenBytes;
}): string {
  if (!input.rotate) {
    const existing = parseShareToken(input.existing);
    if (existing) {
      return existing;
    }
  }
  return generateShareToken(input.randomBytesImpl);
}

/** Empty, junk, and unknown quoteId are rejected. Extra keys are stripped. */
export function parseQuoteShare(json: unknown): ParseQuoteShareResult {
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }
  return {
    ok: true,
    payload: { quoteId: parsed.data.quoteId, rotate: parsed.data.rotate === true },
  };
}

export function quoteShareRejectStatus(reason: QuoteShareSkipReason): 404 | 409 {
  return reason === "missing" ? 404 : 409;
}
