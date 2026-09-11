import { z } from "zod";
import { formatAbn } from "./abn";
import { parseEmail } from "./contact";
import { formatAudFromCents } from "./money";
import { printDocumentTitle, type PrintKind } from "./print";
import { parseShareToken, quoteSharePath } from "./share";

export const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 8_000;

export const EMAIL_SEND_NOTE =
  "Emails a sent quote or a live invoice to the customer address via Resend. Off until RESEND_API_KEY and EMAIL_FROM are set. Not a mailbox.";

export type EmailDocumentKind = "quote" | "invoice";

export type EmailSkipReason = "no_key" | "no_email" | "not_sendable";

export type EmailSendResult =
  | { status: "skipped"; reason: EmailSkipReason }
  | { status: "error"; reason: "network" | "http" | "parse"; message: string }
  | { status: "sent"; id: string };

export type ParseSendEmailResult =
  | { ok: true; payload: { kind: EmailDocumentKind; id: string } }
  | { ok: false; issues: string[] };

const payloadSchema = z.object({
  kind: z.enum(["quote", "invoice"]),
  id: z.string().uuid(),
});

export function resendApiKeyFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const key = env.RESEND_API_KEY?.trim();
  return key ? key : undefined;
}

export function parseFromAddress(raw: string | number | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  const angled = /<([^>]+)>\s*$/.exec(trimmed);
  const address = (angled ? angled[1] : trimmed).trim();
  const parsed = parseEmail(address);
  if (!parsed) {
    return null;
  }
  return trimmed;
}

export function emailFromFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const parsed = parseFromAddress(env.EMAIL_FROM);
  return parsed ?? undefined;
}

export function emailSendConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(resendApiKeyFromEnv(env) && emailFromFromEnv(env));
}

/** Empty is not a recipient. Junk (no @domain) → null. Reuses Stage 12 shape. */
export function parseRecipientEmail(raw: string | number | null | undefined): string | null {
  const parsed = parseEmail(raw);
  if (parsed === null || parsed === "") {
    return null;
  }
  return parsed;
}

export function canEmailDocument(kind: EmailDocumentKind, status: string): boolean {
  if (kind === "quote") {
    return status === "sent" || status === "accepted" || status === "declined";
  }
  return status === "sent" || status === "paid";
}

export function emailSkipReason(input: {
  configured: boolean;
  to: string | null;
  kind: EmailDocumentKind;
  status: string;
}): EmailSkipReason | null {
  if (!input.configured) {
    return "no_key";
  }
  if (!input.to) {
    return "no_email";
  }
  if (!canEmailDocument(input.kind, input.status)) {
    return "not_sendable";
  }
  return null;
}

export function documentPrintPath(
  kind: EmailDocumentKind,
  jobId: string,
  documentId: string,
): string {
  if (kind === "quote") {
    return `/jobs/${jobId}/quotes/${documentId}/print`;
  }
  return `/jobs/${jobId}/invoices/${documentId}/print`;
}

export function documentEmailPath(input: {
  kind: EmailDocumentKind;
  jobId: string;
  documentId: string;
  shareToken?: string | null;
}): string {
  if (input.kind === "quote") {
    const token = parseShareToken(input.shareToken);
    if (token) {
      return quoteSharePath(token);
    }
  }
  return documentPrintPath(input.kind, input.jobId, input.documentId);
}

export function describeEmailSkip(reason: EmailSkipReason): string {
  if (reason === "no_key") {
    return "Email send is not available on this site. Print the document or copy the share link instead.";
  }
  if (reason === "no_email") {
    return "This customer has no email address. Add one on the customer, then try again.";
  }
  return "Only a sent, accepted, or declined quote, or a sent or paid invoice, can be emailed. Drafts, superseded quotes, and void invoices are not emailed.";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function composeDocumentEmail(input: {
  kind: EmailDocumentKind;
  docNumber: string;
  status: string;
  orgName: string;
  abn: string;
  gstRegistered: boolean;
  gstCents: number;
  totalCents: number;
  origin: string;
  jobId: string;
  documentId: string;
  shareToken?: string | null;
}): { subject: string; html: string } {
  const title = printDocumentTitle({
    kind: input.kind as PrintKind,
    docNumber: input.docNumber,
    status: input.status,
    gstRegistered: input.gstRegistered,
  });
  const gst = formatAudFromCents(input.gstCents);
  const total = formatAudFromCents(input.totalCents);
  const abn = formatAbn(input.abn);
  const path = documentEmailPath({
    kind: input.kind,
    jobId: input.jobId,
    documentId: input.documentId,
    shareToken: input.shareToken,
  });
  const origin = input.origin.trim().replace(/\/$/, "");
  const link = origin ? `${origin}${path}` : path;
  const subject = `${title} from ${input.orgName}`;
  const html = [
    `<p>Hi,</p>`,
    `<p>Please find your ${escapeHtml(title)} from ${escapeHtml(input.orgName)} (ABN ${escapeHtml(abn)}) below.</p>`,
    `<p>GST ${escapeHtml(gst)}</p>`,
    `<p>Total ${escapeHtml(total)}</p>`,
    `<p><a href="${escapeHtml(link)}">Open the document</a></p>`,
    `<p>Thanks for your business.</p>`,
    `<p style="color:#6b7280;font-size:12px;">This is not tax advice, and OG Job Book does not lodge a BAS.</p>`,
  ].join("");
  return { subject, html };
}

function asResendId(payload: unknown): string | null {
  if (payload == null || typeof payload !== "object") {
    return null;
  }
  const id = (payload as { id?: unknown }).id;
  if (typeof id !== "string" || id.trim() === "") {
    return null;
  }
  return id.trim();
}

function httpErrorMessage(status: number, payload: unknown): string {
  if (payload != null && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") {
      return `HTTP ${status}: ${message.trim().slice(0, 200)}`;
    }
  }
  return `HTTP ${status}`;
}

export interface SendDocumentEmailInput {
  kind: EmailDocumentKind;
  status: string;
  docNumber: string;
  orgName: string;
  abn: string;
  gstRegistered: boolean;
  gstCents: number;
  totalCents: number;
  jobId: string;
  documentId: string;
  to: string | null;
  origin: string;
  shareToken?: string | null;
  apiKey?: string | null;
  from?: string | null;
  fetchImpl?: typeof fetch;
}

export async function sendDocumentEmail(
  input: SendDocumentEmailInput,
): Promise<EmailSendResult> {
  const apiKey = input.apiKey === undefined ? resendApiKeyFromEnv() : input.apiKey?.trim();
  const from =
    input.from === undefined ? emailFromFromEnv() : parseFromAddress(input.from ?? "");
  const skip = emailSkipReason({
    configured: Boolean(apiKey && from),
    to: input.to,
    kind: input.kind,
    status: input.status,
  });
  if (skip) {
    return { status: "skipped", reason: skip };
  }

  const composed = composeDocumentEmail({
    kind: input.kind,
    docNumber: input.docNumber,
    status: input.status,
    orgName: input.orgName,
    abn: input.abn,
    gstRegistered: input.gstRegistered,
    gstCents: input.gstCents,
    totalCents: input.totalCents,
    origin: input.origin,
    jobId: input.jobId,
    documentId: input.documentId,
    shareToken: input.shareToken,
  });

  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(RESEND_EMAILS_URL, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: composed.subject,
        html: composed.html,
      }),
    });
    const raw = await response.text();
    let payload: unknown = null;
    if (raw.trim() !== "") {
      try {
        payload = JSON.parse(raw) as unknown;
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      return { status: "error", reason: "http", message: httpErrorMessage(response.status, payload) };
    }
    const id = asResendId(payload);
    if (!id) {
      return { status: "error", reason: "parse", message: "Resend did not return an id" };
    }
    return { status: "sent", id };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { status: "error", reason: "network", message: "timed out" };
    }
    return { status: "error", reason: "network", message: "network error" };
  }
}

/** Empty, junk, and unknown kinds are rejected. Extra keys are stripped. */
export function parseSendEmail(json: unknown): ParseSendEmailResult {
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }
  return { ok: true, payload: parsed.data };
}

export function emailRejectStatus(
  reason: EmailSkipReason | "missing",
): 404 | 409 {
  return reason === "missing" ? 404 : 409;
}
