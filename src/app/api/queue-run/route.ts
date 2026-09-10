import { revalidatePath } from "next/cache";
import { loadDb, tenantJsonDenied } from "@/db/ready";
import {
  QUEUE_NOTE,
  parseQueueRun,
  queueRejectStatus,
} from "@/lib/ledger/queue";
import { todayIsoSydney } from "@/lib/ledger/tax";
import { runDueRecurringQueue } from "@/lib/queue/run";

export const dynamic = "force-dynamic";

async function readJsonBody(request: Request): Promise<
  | { ok: true; json: unknown }
  | { ok: false }
> {
  const text = await request.text();
  if (text.trim() === "") {
    return { ok: true, json: null };
  }
  try {
    return { ok: true, json: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return Response.json(
      {
        queued: false,
        skipped: false,
        note: QUEUE_NOTE,
        issues: ["Expected a JSON object"],
      },
      { status: 400 },
    );
  }
  const parsed = parseQueueRun(body.json);
  if (!parsed.ok) {
    return Response.json(
      {
        queued: false,
        skipped: false,
        note: QUEUE_NOTE,
        issues: parsed.issues,
      },
      { status: 400 },
    );
  }

  const state = await loadDb();
  if (!state.ok) {
    return Response.json(
      {
        queued: false,
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
        queued: false,
        skipped: false,
        note: "Organisation not found.",
      },
      { status: 404 },
    );
  }

  const result = await runDueRecurringQueue({
    db: state.db,
    orgId: state.org.id,
    today: todayIsoSydney(),
    recurringInvoiceId:
      parsed.payload.kind === "issue-recurring"
        ? parsed.payload.recurringInvoiceId
        : undefined,
  });

  if (result.status === "skipped") {
    return Response.json(
      {
        queued: false,
        skipped: true,
        note: result.note,
        reason: result.reason,
      },
      { status: queueRejectStatus(result.reason) },
    );
  }
  if (result.status === "error") {
    return Response.json(
      {
        queued: false,
        skipped: false,
        note: result.message,
      },
      { status: 502 },
    );
  }

  revalidatePath("/");
  return Response.json({
    queued: true,
    skipped: false,
    note: result.note,
    ids: result.ids,
    queuedCount: result.queued,
    issued: result.issued,
    skippedCount: result.skipped,
  });
}
