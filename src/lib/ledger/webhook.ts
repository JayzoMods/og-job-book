import { z } from "zod";
import { invoiceBalanceCents } from "./credit";
import { PAYMENT_METHODS, type PaymentMethod } from "./tax";

export const PAYMENT_WEBHOOK_NOTE =
  "Applies a recorded payment on the invoice. Not Stripe. Not Confirmation of Payee. Status only.";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const payloadSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  paidOn: z.string().regex(ISO_DATE),
  method: z.enum(PAYMENT_METHODS),
});

export type PaymentWebhookPayload = {
  invoiceId: string;
  amountCents: number;
  paidOn: string;
  method: PaymentMethod;
};

export type ParsePaymentWebhookResult =
  | { ok: true; payload: PaymentWebhookPayload }
  | { ok: false; issues: string[] };

export type WebhookApplyReason = "ok" | "missing" | "void";

/** Empty, junk, non-integer, and non-positive amounts are rejected. Extra keys are stripped. */
export function parsePaymentWebhook(json: unknown): ParsePaymentWebhookResult {
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }
  return { ok: true, payload: parsed.data };
}

export function webhookApplyReason(
  invoice: { status: string } | null | undefined,
): WebhookApplyReason {
  if (!invoice) {
    return "missing";
  }
  if (invoice.status === "void") {
    return "void";
  }
  return "ok";
}

export function webhookRejectStatus(reason: Exclude<WebhookApplyReason, "ok">): 404 | 409 {
  return reason === "void" ? 409 : 404;
}

export function webhookPaymentOutcome(
  invoice: {
    totalCents: number;
    paidCents: number;
    creditedCents: number;
    retentionHeldCents: number;
  },
  amountCents: number,
): { remainingCents: number; markPaid: boolean } {
  const remainingCents = invoiceBalanceCents(
    invoice.totalCents,
    invoice.paidCents + amountCents,
    invoice.creditedCents,
    invoice.retentionHeldCents,
  );
  return {
    remainingCents,
    markPaid: remainingCents <= 0 && invoice.totalCents > 0,
  };
}
