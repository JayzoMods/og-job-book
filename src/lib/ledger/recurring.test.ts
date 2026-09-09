import { describe, expect, it } from "vitest";
import {
  addCalendarMonths,
  canIssueRecurring,
  endOnBeforeNext,
  nextIssueOn,
  parseOptionalIsoDate,
  parseRecurringFrequency,
  parseRecurringStatus,
  recurringFrequencyLabel,
  recurringIsDue,
} from "./recurring";

const active = {
  status: "active",
  frequency: "yearly",
  nextIssueOn: "2026-09-01",
  endOn: null as string | null,
  hasLines: true,
  jobStatus: "paid",
};

describe("parseRecurringFrequency", () => {
  it("rejects empty and junk", () => {
    expect(parseRecurringFrequency("")).toBeNull();
    expect(parseRecurringFrequency("   ")).toBeNull();
    expect(parseRecurringFrequency(null)).toBeNull();
    expect(parseRecurringFrequency("daily")).toBeNull();
    expect(parseRecurringFrequency("week")).toBeNull();
  });

  it("accepts the four cadences", () => {
    expect(parseRecurringFrequency("weekly")).toBe("weekly");
    expect(parseRecurringFrequency("MONTHLY")).toBe("monthly");
    expect(parseRecurringFrequency("quarterly")).toBe("quarterly");
    expect(parseRecurringFrequency("yearly")).toBe("yearly");
  });
});

describe("parseRecurringStatus", () => {
  it("treats empty and junk as active", () => {
    expect(parseRecurringStatus("")).toBe("active");
    expect(parseRecurringStatus("nope")).toBe("active");
    expect(parseRecurringStatus("paused")).toBe("paused");
  });
});

describe("parseOptionalIsoDate", () => {
  it("allows empty and rejects junk", () => {
    expect(parseOptionalIsoDate("")).toEqual({ ok: true, value: null });
    expect(parseOptionalIsoDate("   ")).toEqual({ ok: true, value: null });
    expect(parseOptionalIsoDate("2026-13-01")).toEqual({ ok: false });
    expect(parseOptionalIsoDate("not-a-date")).toEqual({ ok: false });
    expect(parseOptionalIsoDate("2026-09-01")).toEqual({ ok: true, value: "2026-09-01" });
  });
});

describe("addCalendarMonths and nextIssueOn", () => {
  it("clamps 31 January onto February", () => {
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addCalendarMonths("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("clamps 29 February onto the next non-leap February", () => {
    expect(addCalendarMonths("2024-02-29", 12)).toBe("2025-02-28");
  });

  it("returns null for junk dates", () => {
    expect(addCalendarMonths("", 1)).toBeNull();
    expect(addCalendarMonths("2026-09-31", 1)).toBeNull();
    expect(nextIssueOn("2026-09-01", "")).toBeNull();
    expect(nextIssueOn("2026-09-01", "daily")).toBeNull();
  });

  it("advances weekly, monthly, quarterly, and yearly from 1 Sep 2026", () => {
    expect(nextIssueOn("2026-09-01", "weekly")).toBe("2026-09-08");
    expect(nextIssueOn("2026-09-01", "monthly")).toBe("2026-10-01");
    expect(nextIssueOn("2026-09-01", "quarterly")).toBe("2026-12-01");
    expect(nextIssueOn("2026-09-01", "yearly")).toBe("2027-09-01");
  });

  it("does not skip missed periods — one issue advances one step from next_issue_on", () => {
    expect(nextIssueOn("2026-09-01", "monthly")).toBe("2026-10-01");
  });
});

describe("endOnBeforeNext", () => {
  it("allows end on the next issue date and rejects an earlier end", () => {
    expect(endOnBeforeNext("2026-09-01", null)).toBe(false);
    expect(endOnBeforeNext("2026-09-01", "2026-09-01")).toBe(false);
    expect(endOnBeforeNext("2026-09-01", "2026-08-31")).toBe(true);
  });
});

describe("canIssueRecurring and recurringIsDue", () => {
  it("rejects paused, cancelled, empty lines, junk cadence, and an end before next", () => {
    expect(canIssueRecurring(active)).toBe(true);
    expect(canIssueRecurring({ ...active, status: "paused" })).toBe(false);
    expect(canIssueRecurring({ ...active, jobStatus: "cancelled" })).toBe(false);
    expect(canIssueRecurring({ ...active, hasLines: false })).toBe(false);
    expect(canIssueRecurring({ ...active, frequency: "daily" })).toBe(false);
    expect(canIssueRecurring({ ...active, nextIssueOn: "" })).toBe(false);
    expect(canIssueRecurring({ ...active, endOn: "2026-08-31" })).toBe(false);
  });

  it("allows issuing early, and treats due as next on or before today", () => {
    expect(canIssueRecurring({ ...active, nextIssueOn: "2026-10-01" })).toBe(true);
    expect(recurringIsDue(active, "2026-09-09")).toBe(true);
    expect(recurringIsDue(active, "2026-09-01")).toBe(true);
    expect(recurringIsDue({ ...active, nextIssueOn: "2026-10-01" }, "2026-09-09")).toBe(
      false,
    );
    expect(recurringIsDue({ ...active, status: "paused" }, "2026-09-09")).toBe(false);
  });

  it("allows the last issue when end equals next, then the advanced date cannot issue", () => {
    expect(canIssueRecurring({ ...active, endOn: "2026-09-01" })).toBe(true);
    expect(
      canIssueRecurring({
        ...active,
        nextIssueOn: "2027-09-01",
        endOn: "2026-09-01",
      }),
    ).toBe(false);
  });
});

describe("recurringFrequencyLabel", () => {
  it("uses sentence case labels", () => {
    expect(recurringFrequencyLabel("weekly")).toBe("Weekly");
    expect(recurringFrequencyLabel("yearly")).toBe("Yearly");
  });
});
