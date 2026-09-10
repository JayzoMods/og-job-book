import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { invoiceBalanceCents } from "./credit";
import { formatAudFromCents } from "./money";

export const STRIPE_CHECKOUT_URL = "https://api.stripe.com/v1/checkout/sessions";
const SEND_TIMEOUT_MS = 8_000;
const SIGNATURE_TOLERANCE_SECONDS = 300;

export const STRIPE_CHARGE_NOTE =
  "Starts a Stripe Checkout Session for the amount due now on a live invoice, then records a card payment when Stripe posts the webhook. Off until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set. Leave those unset on a public no-login deploy. Not Confirmation of Payee. Not a BAS.";

export type StripeSkipReason = "no_key" | "no_origin" | "not_payable" | "already_paid";

export type StripeCheckoutResult =
  | { status: "skipped"; reason: StripeSkipReason }
  | { status: "error"; reason: "network" | "http" | "parse"; message: string }
  | { status: "created"; id: string; url: string };

export type ParseStripeCheckoutResult =
  | { ok: true; payload: { invoiceId: string } }
  | { ok: false; issues: string[] };

export type StripeCheckoutCompleted =
  | { ok: true; sessionId: string; invoiceId: string; amountCents: number }
  | { ok: false; reason: "ignored" | "junk" };

const invoiceIdSchema = z.object({
  invoiceId: z.string().uuid(),
});

export function stripeSecretKeyFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const key = env.STRIPE_SECRET_KEY?.trim();
  return key ? key : undefined;
}

export function stripeWebhookSecretFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  return secret ? secret : undefined;
}

export function stripeChargeConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(stripeSecretKeyFromEnv(env) && stripeWebhookSecretFromEnv(env));
}

export function parseCheckoutOrigin(raw: string | number | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim().replace(/\/$/, "");
  if (trimmed === "") {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

export function dueNowCents(input: {
  totalCents: number;
  paidCents: number;
  creditedCents: number;
  retentionHeldCents: number;
}): number {
  return invoiceBalanceCents(
    input.totalCents,
    input.paidCents,
    input.creditedCents,
    input.retentionHeldCents,
  );
}

export function canChargeInvoice(status: string, remainingCents: number): boolean {
  if (status === "void" || status === "draft" || status === "") {
    return false;
  }
  return remainingCents > 0;
}

export function stripeSkipReason(input: {
  configured: boolean;
  origin: string | null;
  status: string;
  remainingCents: number;
}): StripeSkipReason | null {
  if (!input.configured) {
    return "no_key";
  }
  if (!input.origin) {
    return "no_origin";
  }
  if (input.status === "void" || input.status === "draft" || input.status === "") {
    return "not_payable";
  }
  if (input.remainingCents <= 0) {
    return "already_paid";
  }
  return null;
}

export function describeStripeSkip(reason: StripeSkipReason): string {
  if (reason === "no_key") {
    return "Card pay is off until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set on this deploy. Leave those unset on a public no-login site.";
  }
  if (reason === "no_origin") {
    return "Card pay needs an http or https origin for the Stripe return URLs.";
  }
  if (reason === "already_paid") {
    return "This invoice has no amount due now. Credits and retention held are already taken off. Drafts and void invoices are not charged.";
  }
  return "Only a sent or paid invoice with amount due now can be charged. Drafts and void invoices are not charged.";
}

export function stripeCheckoutFormBody(input: {
  invoiceId: string;
  jobId: string;
  docNumber: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("submit_type", "pay");
  params.set("locale", "en-AU");
  params.set("client_reference_id", input.invoiceId);
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "aud");
  params.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  params.set(
    "line_items[0][price_data][product_data][name]",
    `${input.docNumber} amount due now ${formatAudFromCents(input.amountCents)}`,
  );
  params.set("metadata[invoiceId]", input.invoiceId);
  params.set("metadata[jobId]", input.jobId);
  params.set("payment_intent_data[metadata][invoiceId]", input.invoiceId);
  if (input.customerEmail) {
    params.set("customer_email", input.customerEmail);
  }
  return params.toString();
}

function asCheckoutSession(payload: unknown): { id: string; url: string } | null {
  if (payload == null || typeof payload !== "object") {
    return null;
  }
  const id = (payload as { id?: unknown }).id;
  const url = (payload as { url?: unknown }).url;
  if (typeof id !== "string" || id.trim() === "") {
    return null;
  }
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return null;
  }
  return { id: id.trim(), url };
}

function httpErrorMessage(status: number, payload: unknown): string {
  if (payload != null && typeof payload === "object") {
    const error = (payload as { error?: { message?: unknown } }).error;
    if (error && typeof error.message === "string" && error.message.trim() !== "") {
      return `HTTP ${status}: ${error.message.trim().slice(0, 200)}`;
    }
  }
  return `HTTP ${status}`;
}

export interface CreateCheckoutSessionInput {
  invoiceId: string;
  jobId: string;
  docNumber: string;
  status: string;
  remainingCents: number;
  origin: string;
  customerEmail?: string | null;
  apiKey?: string | null;
  webhookSecret?: string | null;
  fetchImpl?: typeof fetch;
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<StripeCheckoutResult> {
  const apiKey = input.apiKey === undefined ? stripeSecretKeyFromEnv() : input.apiKey?.trim();
  const webhookSecret =
    input.webhookSecret === undefined
      ? stripeWebhookSecretFromEnv()
      : input.webhookSecret?.trim();
  const origin = parseCheckoutOrigin(input.origin);
  const skip = stripeSkipReason({
    configured: Boolean(apiKey && webhookSecret),
    origin,
    status: input.status,
    remainingCents: input.remainingCents,
  });
  if (skip) {
    return { status: "skipped", reason: skip };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const successUrl = `${origin}/jobs/${input.jobId}?card=1`;
  const cancelUrl = `${origin}/jobs/${input.jobId}`;
  const body = stripeCheckoutFormBody({
    invoiceId: input.invoiceId,
    jobId: input.jobId,
    docNumber: input.docNumber,
    amountCents: input.remainingCents,
    successUrl,
    cancelUrl,
    customerEmail: input.customerEmail ?? null,
  });

  try {
    const response = await fetchImpl(STRIPE_CHECKOUT_URL, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
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
    const session = asCheckoutSession(payload);
    if (!session) {
      return { status: "error", reason: "parse", message: "Stripe did not return a Checkout url" };
    }
    return { status: "created", id: session.id, url: session.url };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { status: "error", reason: "network", message: "timed out" };
    }
    return { status: "error", reason: "network", message: "network error" };
  }
}

export function parseStripeSignatureHeader(
  header: string | null | undefined,
): { timestamp: number; signatures: string[] } | null {
  const raw = String(header ?? "").trim();
  if (raw === "") {
    return null;
  }
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (key === "t") {
      if (!/^\d+$/.test(value)) {
        return null;
      }
      timestamp = Number(value);
    } else if (key === "v1" && value !== "") {
      signatures.push(value);
    }
  }
  if (timestamp === null || signatures.length === 0) {
    return null;
  }
  return { timestamp, signatures };
}

function hexEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function verifyStripeSignature(input: {
  payload: string;
  header: string | null | undefined;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  const secret = input.secret.trim();
  if (secret === "" || input.payload === "") {
    return false;
  }
  const parsed = parseStripeSignatureHeader(input.header);
  if (!parsed) {
    return false;
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - parsed.timestamp) > tolerance) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${input.payload}`)
    .digest("hex");
  return parsed.signatures.some((signature) => hexEquals(expected, signature));
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function invoiceIdFromSession(session: {
  client_reference_id?: unknown;
  metadata?: unknown;
}): string | null {
  const fromRef = invoiceIdSchema.safeParse({
    invoiceId: session.client_reference_id,
  });
  if (fromRef.success) {
    return fromRef.data.invoiceId;
  }
  if (session.metadata != null && typeof session.metadata === "object") {
    const fromMeta = invoiceIdSchema.safeParse({
      invoiceId: (session.metadata as { invoiceId?: unknown }).invoiceId,
    });
    if (fromMeta.success) {
      return fromMeta.data.invoiceId;
    }
  }
  return null;
}

export function parseStripeCheckoutCompleted(json: unknown): StripeCheckoutCompleted {
  if (json == null || typeof json !== "object") {
    return { ok: false, reason: "junk" };
  }
  const type = (json as { type?: unknown }).type;
  if (typeof type !== "string" || type.trim() === "") {
    return { ok: false, reason: "junk" };
  }
  if (type !== "checkout.session.completed") {
    return { ok: false, reason: "ignored" };
  }
  const data = (json as { data?: unknown }).data;
  if (data == null || typeof data !== "object") {
    return { ok: false, reason: "junk" };
  }
  const session = (data as { object?: unknown }).object;
  if (session == null || typeof session !== "object") {
    return { ok: false, reason: "junk" };
  }
  const row = session as {
    id?: unknown;
    amount_total?: unknown;
    currency?: unknown;
    payment_status?: unknown;
    client_reference_id?: unknown;
    metadata?: unknown;
  };
  if (typeof row.id !== "string" || !row.id.startsWith("cs_")) {
    return { ok: false, reason: "junk" };
  }
  if (row.payment_status !== "paid") {
    return { ok: false, reason: "ignored" };
  }
  if (typeof row.currency !== "string" || row.currency.toLowerCase() !== "aud") {
    return { ok: false, reason: "junk" };
  }
  const amountCents = asPositiveInt(row.amount_total);
  const invoiceId = invoiceIdFromSession(row);
  if (amountCents === null || !invoiceId) {
    return { ok: false, reason: "junk" };
  }
  return {
    ok: true,
    sessionId: row.id,
    invoiceId,
    amountCents,
  };
}

/** Empty, junk, and missing invoiceId are rejected. Extra keys are stripped. */
export function parseStripeCheckout(json: unknown): ParseStripeCheckoutResult {
  const parsed = invoiceIdSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }
  return { ok: true, payload: parsed.data };
}

export function stripeRejectStatus(
  reason: StripeSkipReason | "missing" | "void" | "signature",
): 400 | 404 | 409 {
  if (reason === "signature") {
    return 400;
  }
  if (reason === "missing") {
    return 404;
  }
  return 409;
}

export function stripeWebhookApplyReason(input: {
  invoice: { status: string } | null | undefined;
  remainingCents: number;
}): "ok" | "missing" | "void" | "not_payable" | "already_paid" {
  if (!input.invoice) {
    return "missing";
  }
  if (input.invoice.status === "void") {
    return "void";
  }
  if (input.invoice.status === "draft") {
    return "not_payable";
  }
  if (input.remainingCents <= 0) {
    return "already_paid";
  }
  return "ok";
}
