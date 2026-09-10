import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { loadDb, tenantJsonDenied } from "@/db/ready";
import { getJobInOrg, getQuoteById } from "@/db/queries";
import { quotes } from "@/db/schema";
import {
  QUOTE_SHARE_NOTE,
  parseQuoteShare,
  quoteSharePath,
  quoteShareRejectStatus,
  quoteShareSkipReason,
  resolveShareToken,
} from "@/lib/ledger/share";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const parsed = parseQuoteShare(json);
  if (!parsed.ok) {
    return Response.json(
      {
        minted: false,
        skipped: false,
        note: QUOTE_SHARE_NOTE,
        issues: parsed.issues,
      },
      { status: 400 },
    );
  }

  const state = await loadDb();
  if (!state.ok) {
    return Response.json(
      {
        minted: false,
        skipped: false,
        note: "Postgres is not connected. Run docker compose up -d, then npm run db:apply.",
      },
      { status: 503 },
    );
  }
  const denied = tenantJsonDenied(state);
  if (denied) {
    return denied;
  }
  if (!state.org) {
    return Response.json(
      {
        minted: false,
        skipped: false,
        note: "Quote not found.",
        quoteId: parsed.payload.quoteId,
      },
      { status: quoteShareRejectStatus("missing") },
    );
  }

  const quote = await getQuoteById(state.db, parsed.payload.quoteId);
  const job = quote ? await getJobInOrg(state.db, quote.jobId, state.org.id) : null;
  if (!quote || !job) {
    return Response.json(
      {
        minted: false,
        skipped: false,
        note: "Quote not found.",
        quoteId: parsed.payload.quoteId,
      },
      { status: quoteShareRejectStatus("missing") },
    );
  }

  const skip = quoteShareSkipReason({ status: quote.status });
  if (skip) {
    return Response.json(
      {
        minted: false,
        skipped: true,
        note: QUOTE_SHARE_NOTE,
        reason: skip,
        quoteId: quote.id,
        docNumber: quote.docNumber,
        jobId: job.id,
      },
      { status: quoteShareRejectStatus(skip) },
    );
  }

  const token = resolveShareToken({
    existing: quote.shareToken,
    rotate: parsed.payload.rotate,
  });
  if (token !== quote.shareToken) {
    await state.db
      .update(quotes)
      .set({ shareToken: token })
      .where(eq(quotes.id, quote.id));
  }

  const path = quoteSharePath(token);
  revalidatePath(`/jobs/${job.id}`);
  revalidatePath(path);
  return Response.json({
    minted: true,
    skipped: false,
    note: QUOTE_SHARE_NOTE,
    token,
    path,
    quoteId: quote.id,
    docNumber: quote.docNumber,
    jobId: job.id,
  });
}
