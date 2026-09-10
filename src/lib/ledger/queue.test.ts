import { describe, expect, it, vi } from "vitest";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import { computeDocument } from "./tax";
import {
  ISSUE_RECURRING_JOB,
  QUEUE_NAME,
  QUEUE_NOTE,
  bullmqConnection,
  describeQueueSkip,
  dueRecurringJobs,
  enqueueDueRecurring,
  parseIssueRecurringJob,
  parseQueueRun,
  parseRedisUrl,
  queueConfigured,
  queueJobId,
  queueRejectStatus,
  queueSkipReason,
  redactQueueError,
  redisUrlFromEnv,
} from "./queue";

const REDIS = "redis://127.0.0.1:6380";
const Q_0001 = demoSeed.quotes.find((row) => row.docNumber === "Q-0001");
const PRIYA = demoSeed.recurringInvoices.find(
  (row) => row.id === DEMO_IDS.recurringAnnual,
);
const PRIYA_JOB = demoSeed.jobs.find((row) => row.id === DEMO_IDS.jobPaid);

function q0001Totals() {
  if (!Q_0001) {
    throw new Error("missing Q-0001");
  }
  return computeDocument(Q_0001.lines);
}

function priyaRow() {
  if (!PRIYA || !PRIYA_JOB) {
    throw new Error("missing Priya template");
  }
  return {
    id: PRIYA.id,
    status: PRIYA.status,
    frequency: PRIYA.frequency,
    nextIssueOn: PRIYA.nextIssueOn,
    endOn: PRIYA.endOn,
    hasLines: PRIYA.lines.length > 0,
    jobStatus: PRIYA_JOB.status,
  };
}

describe("parseRedisUrl", () => {
  it("treats empty and junk as off", () => {
    expect(parseRedisUrl("")).toBeNull();
    expect(parseRedisUrl("   ")).toBeNull();
    expect(parseRedisUrl(null)).toBeNull();
    expect(parseRedisUrl("redis")).toBeNull();
    expect(parseRedisUrl("http://127.0.0.1:6380")).toBeNull();
    expect(parseRedisUrl("postgres://jobbook:jobbook@127.0.0.1:5433/jobbook")).toBeNull();
    expect(parseRedisUrl("redis://")).toBeNull();
    expect(parseRedisUrl("redis://:not-a-port")).toBeNull();
  });

  it("accepts redis and rediss with a host", () => {
    expect(parseRedisUrl(`  ${REDIS}  `)).toEqual({
      host: "127.0.0.1",
      port: 6380,
    });
    expect(parseRedisUrl("redis://localhost")).toEqual({
      host: "localhost",
      port: 6379,
    });
    expect(parseRedisUrl("redis://:secret@127.0.0.1:6380/2")).toEqual({
      host: "127.0.0.1",
      port: 6380,
      password: "secret",
      db: 2,
    });
    expect(parseRedisUrl("rediss://user:p%40ss@broker.example:6380")).toEqual({
      host: "broker.example",
      port: 6380,
      username: "user",
      password: "p@ss",
      tls: {},
    });
  });
});

describe("queueConfigured", () => {
  it("needs a parseable REDIS_URL", () => {
    expect(redisUrlFromEnv({})).toBeUndefined();
    expect(redisUrlFromEnv({ REDIS_URL: "  " })).toBeUndefined();
    expect(queueConfigured({})).toBe(false);
    expect(queueConfigured({ REDIS_URL: "not-redis" })).toBe(false);
    expect(queueConfigured({ REDIS_URL: REDIS })).toBe(true);
    expect(bullmqConnection({ host: "127.0.0.1", port: 6380 }).maxRetriesPerRequest).toBe(
      null,
    );
  });
});

describe("parseQueueRun", () => {
  it("treats empty as sweep and rejects junk", () => {
    expect(parseQueueRun(null)).toEqual({ ok: true, payload: { kind: "sweep" } });
    expect(parseQueueRun(undefined)).toEqual({
      ok: true,
      payload: { kind: "sweep" },
    });
    expect(parseQueueRun({})).toEqual({ ok: true, payload: { kind: "sweep" } });
    expect(parseQueueRun({ kind: "sweep" })).toEqual({
      ok: true,
      payload: { kind: "sweep" },
    });
    expect(parseQueueRun("nope").ok).toBe(false);
    expect(parseQueueRun([]).ok).toBe(false);
    expect(parseQueueRun({ extra: 1 }).ok).toBe(false);
    expect(parseQueueRun({ kind: "email" }).ok).toBe(false);
    expect(parseQueueRun({ kind: "issue-recurring" }).ok).toBe(false);
    expect(
      parseQueueRun({ kind: "issue-recurring", recurringInvoiceId: "not-a-uuid" }).ok,
    ).toBe(false);
  });

  it("accepts a uuid issue job", () => {
    expect(
      parseQueueRun({
        kind: "issue-recurring",
        recurringInvoiceId: DEMO_IDS.recurringAnnual,
      }),
    ).toEqual({
      ok: true,
      payload: {
        kind: "issue-recurring",
        recurringInvoiceId: DEMO_IDS.recurringAnnual,
      },
    });
  });
});

describe("parseIssueRecurringJob", () => {
  it("rejects empty and junk", () => {
    expect(parseIssueRecurringJob(null)).toBeNull();
    expect(parseIssueRecurringJob({})).toBeNull();
    expect(parseIssueRecurringJob({ recurringInvoiceId: "nope" })).toBeNull();
    expect(
      parseIssueRecurringJob({ recurringInvoiceId: DEMO_IDS.recurringAnnual }),
    ).toEqual({ recurringInvoiceId: DEMO_IDS.recurringAnnual });
  });
});

describe("dueRecurringJobs", () => {
  it("queues Priya as at 10 Sep 2026 and does not change Q-0001 GST", () => {
    const due = dueRecurringJobs([priyaRow()], "2026-09-10");
    expect(due).toEqual([
      {
        recurringInvoiceId: DEMO_IDS.recurringAnnual,
        nextIssueOn: "2026-09-01",
      },
    ]);
    expect(dueRecurringJobs([priyaRow()], "2026-08-31")).toEqual([]);
    expect(
      dueRecurringJobs([{ ...priyaRow(), status: "paused" }], "2026-09-10"),
    ).toEqual([]);
    expect(
      dueRecurringJobs([{ ...priyaRow(), jobStatus: "cancelled" }], "2026-09-10"),
    ).toEqual([]);
    const totals = q0001Totals();
    expect(totals.gstCents).toBe(11000);
    expect(totals.totalCents).toBe(123200);
    expect(computeDocument(PRIYA!.lines).totalCents).toBe(44000);
    expect(computeDocument(PRIYA!.lines).gstCents).toBe(4000);
  });
});

describe("enqueueDueRecurring", () => {
  it("does not add when Redis is off", async () => {
    const add = vi.fn();
    const result = await enqueueDueRecurring({
      configured: false,
      jobs: dueRecurringJobs([priyaRow()], "2026-09-10"),
      add,
    });
    expect(result).toEqual({ status: "skipped", reason: "no_key" });
    expect(add).not.toHaveBeenCalled();
  });

  it("adds one job per due template with a period job id", async () => {
    const add = vi.fn(async ({ jobId }: { jobId: string }) => jobId);
    const jobs = dueRecurringJobs([priyaRow()], "2026-09-10");
    const result = await enqueueDueRecurring({
      configured: true,
      jobs,
      add,
    });
    expect(result.status).toBe("queued");
    if (result.status !== "queued") {
      throw new Error("expected queued");
    }
    expect(result.ids).toEqual([
      queueJobId(DEMO_IDS.recurringAnnual, "2026-09-01"),
    ]);
    expect(add).toHaveBeenCalledWith({
      name: ISSUE_RECURRING_JOB,
      data: { recurringInvoiceId: DEMO_IDS.recurringAnnual },
      jobId: queueJobId(DEMO_IDS.recurringAnnual, "2026-09-01"),
    });
    expect(QUEUE_NAME).toBe("og-job-book");
  });

  it("redacts a redis URL from add failures", async () => {
    const result = await enqueueDueRecurring({
      configured: true,
      jobs: [{ recurringInvoiceId: DEMO_IDS.recurringAnnual, nextIssueOn: "2026-09-01" }],
      add: async () => {
        throw new Error(`connect ECONNREFUSED redis://:super-secret@127.0.0.1:6380`);
      },
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") {
      throw new Error("expected error");
    }
    expect(result.message).not.toContain("super-secret");
    expect(result.message).toContain("redis://***");
  });
});

describe("queueSkipReason", () => {
  it("orders no_key, missing, then not_due", () => {
    expect(
      queueSkipReason({ configured: false, found: true, due: true }),
    ).toBe("no_key");
    expect(
      queueSkipReason({ configured: true, found: false, due: false }),
    ).toBe("missing");
    expect(
      queueSkipReason({ configured: true, found: true, due: false }),
    ).toBe("not_due");
    expect(
      queueSkipReason({ configured: true, found: true, due: true }),
    ).toBeNull();
    expect(queueRejectStatus("no_key")).toBe(409);
    expect(queueRejectStatus("missing")).toBe(404);
  });
});

describe("describeQueueSkip", () => {
  it("never echoes REDIS_URL and is not a calendar", () => {
    expect(describeQueueSkip("no_key")).toMatch(/REDIS_URL/);
    expect(describeQueueSkip("no_key")).not.toMatch(/redis:\/\//);
    expect(QUEUE_NOTE).toMatch(/booking calendar/i);
    expect(QUEUE_NOTE).toMatch(/no-login/i);
    expect(redactQueueError(new Error("password=hunter2 boom"))).toContain(
      "password=***",
    );
  });
});
