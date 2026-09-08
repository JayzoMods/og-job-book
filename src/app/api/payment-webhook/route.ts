import { z } from "zod";

const payloadSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(["cash", "transfer", "card"]),
});

export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(json);
  return Response.json(
    {
      received: parsed.success,
      applied: false,
      note: "v1 stub — Stripe is not connected. Record payment in the app. Expected JSON: { invoiceId, amountCents, paidOn, method }",
      issues: parsed.success ? undefined : parsed.error.issues.map((issue) => issue.message),
    },
    { status: parsed.success ? 200 : 400 },
  );
}
