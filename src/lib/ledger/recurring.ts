import { addDaysIso } from "./tax";
import { parseIsoDate } from "./terms";

export const RECURRING_FREQUENCIES = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_STATUSES = ["active", "paused"] as const;

export type RecurringStatus = (typeof RECURRING_STATUSES)[number];

const FREQUENCY_SET = new Set<string>(RECURRING_FREQUENCIES);

/** Empty and junk → null. Do not guess a cadence. */
export function parseRecurringFrequency(
  raw: string | null | undefined,
): RecurringFrequency | null {
  const normalised = (raw ?? "").trim().toLowerCase();
  if (FREQUENCY_SET.has(normalised)) {
    return normalised as RecurringFrequency;
  }
  return null;
}

/** Empty and junk → active so a bad value does not pause billing. */
export function parseRecurringStatus(raw: string | null | undefined): RecurringStatus {
  const normalised = (raw ?? "").trim().toLowerCase();
  if (normalised === "paused") {
    return "paused";
  }
  return "active";
}

export function recurringFrequencyLabel(frequency: RecurringFrequency): string {
  if (frequency === "weekly") {
    return "Weekly";
  }
  if (frequency === "monthly") {
    return "Monthly";
  }
  if (frequency === "quarterly") {
    return "Quarterly";
  }
  return "Yearly";
}

export type OptionalDateParse =
  | { ok: true; value: string | null }
  | { ok: false };

/** Empty end date is allowed. Junk is rejected. */
export function parseOptionalIsoDate(raw: string | null | undefined): OptionalDateParse {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  const iso = parseIsoDate(trimmed);
  if (!iso) {
    return { ok: false };
  }
  return { ok: true, value: iso };
}

export function endOnBeforeNext(
  nextIssueOn: string,
  endOn: string | null | undefined,
): boolean {
  if (!endOn) {
    return false;
  }
  return endOn < nextIssueOn;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Clamp to the last day of the target month (31 Jan → 28/29 Feb). */
export function addCalendarMonths(isoDate: string, months: number): string | null {
  const parsed = parseIsoDate(isoDate);
  if (!parsed || !Number.isInteger(months)) {
    return null;
  }
  const [year, month, day] = parsed.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  const nextDay = Math.min(day, daysInMonth(nextYear, nextMonth));
  const m = String(nextMonth).padStart(2, "0");
  const d = String(nextDay).padStart(2, "0");
  return `${nextYear}-${m}-${d}`;
}

export function nextIssueOn(
  isoDate: string,
  frequency: string | null | undefined,
): string | null {
  const parsed = parseIsoDate(isoDate);
  const cadence = parseRecurringFrequency(frequency);
  if (!parsed || !cadence) {
    return null;
  }
  if (cadence === "weekly") {
    return addDaysIso(parsed, 7);
  }
  if (cadence === "monthly") {
    return addCalendarMonths(parsed, 1);
  }
  if (cadence === "quarterly") {
    return addCalendarMonths(parsed, 3);
  }
  return addCalendarMonths(parsed, 12);
}

export function canIssueRecurring(input: {
  status: string;
  frequency: string;
  nextIssueOn: string;
  endOn?: string | null;
  hasLines: boolean;
  jobStatus: string;
}): boolean {
  if (input.jobStatus === "cancelled") {
    return false;
  }
  if (parseRecurringStatus(input.status) !== "active") {
    return false;
  }
  if (!input.hasLines) {
    return false;
  }
  if (!parseRecurringFrequency(input.frequency)) {
    return false;
  }
  const next = parseIsoDate(input.nextIssueOn);
  if (!next) {
    return false;
  }
  const end = parseOptionalIsoDate(input.endOn ?? "");
  if (!end.ok) {
    return false;
  }
  if (endOnBeforeNext(next, end.value)) {
    return false;
  }
  return true;
}

/** Due means issuable and next issue date is today or earlier (Sydney calendar). */
export function recurringIsDue(
  input: {
    status: string;
    frequency: string;
    nextIssueOn: string;
    endOn?: string | null;
    hasLines: boolean;
    jobStatus: string;
  },
  today: string,
): boolean {
  if (!canIssueRecurring(input)) {
    return false;
  }
  const next = parseIsoDate(input.nextIssueOn);
  const todayIso = parseIsoDate(today);
  if (!next || !todayIso) {
    return false;
  }
  return next <= todayIso;
}
