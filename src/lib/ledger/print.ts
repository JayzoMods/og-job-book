import { DEMO_IDS } from "../../data/demo-seed";

export type PrintKind = "quote" | "invoice" | "credit";

/** Shown on Load demo / trial print sheets. Not a logo stamp on CSV. */
export const PRINT_SAMPLE_MARK = "Sample — OG Job Book";

/** Demo org id, or any signed-in trial account (including Fill sample books). Admin skips. */
export function shouldWatermarkPrint(input: {
  orgId: string | null | undefined;
  isAdmin?: boolean;
  trialStartedAt?: Date | null;
}): boolean {
  if (input.orgId === DEMO_IDS.org) {
    return true;
  }
  if (input.isAdmin) {
    return false;
  }
  return input.trialStartedAt != null;
}

export function printStatementTitle(): string {
  return "Statement of account";
}

export function printRemittanceTitle(): string {
  return "Remittance advice";
}

export function printGstQuarterTitle(): string {
  return "GST quarter report";
}

export function printDocumentTitle(input: {
  kind: PrintKind;
  docNumber: string;
  status: string;
  gstRegistered: boolean;
}): string {
  if (input.kind === "quote") {
    if (input.status === "draft") {
      return `Quote ${input.docNumber} (draft)`;
    }
    if (input.status === "superseded") {
      return `Quote ${input.docNumber} (superseded)`;
    }
    return `Quote ${input.docNumber}`;
  }
  if (input.kind === "credit") {
    return input.status === "void"
      ? `Credit note ${input.docNumber} (void)`
      : `Credit note ${input.docNumber}`;
  }
  const base = input.gstRegistered ? "Tax invoice" : "Invoice";
  if (input.status === "void") {
    return `${base} ${input.docNumber} (void)`;
  }
  return `${base} ${input.docNumber}`;
}

/** Calendar dates stored as YYYY-MM-DD. Empty and junk stay as-is. */
export function formatIsoDateAu(iso: string): string {
  const trimmed = iso.trim();
  if (trimmed === "") {
    return "";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

export function formatInstantAu(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeZone: "Australia/Sydney",
  }).format(date);
}
