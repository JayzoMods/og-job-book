"use server";

import { currentWriteGate, loadDb } from "@/db/ready";
import { isUuid } from "@/db/queries";
import { authConfigured } from "@/lib/ledger/auth";
import {
  extractAiConfigured,
  extractQuoteLines,
  MAX_NOTE_CHARS,
  MAX_PHOTO_BYTES,
  photoMediaType,
  type ProposedLine,
} from "@/lib/extract/lines";

export type ExtractLinesState = {
  ok: boolean;
  skipped: boolean;
  lines: ProposedLine[];
  messages: string[];
  error: string | null;
};

export async function extractLinesAction(
  prev: ExtractLinesState,
  formData: FormData,
): Promise<ExtractLinesState> {
  const jobId = String(formData.get("jobId") ?? "");
  if (!isUuid(jobId)) {
    return { ok: false, skipped: false, lines: [], messages: [], error: "That job was not valid." };
  }

  const state = await loadDb();
  if (!state.ok) {
    if (authConfigured()) {
      return {
        ok: false,
        skipped: false,
        lines: [],
        messages: [],
        error: "Postgres is not connected.",
      };
    }
  } else {
    const gate = currentWriteGate(state);
    if (gate === "unauthenticated") {
      return {
        ok: false,
        skipped: false,
        lines: [],
        messages: [],
        error: "Sign in to extract lines.",
      };
    }
    if (gate === "trial_expired") {
      return {
        ok: false,
        skipped: false,
        lines: [],
        messages: [],
        error: "This 24-hour trial has ended.",
      };
    }
  }

  if (!extractAiConfigured()) {
    return {
      ok: true,
      skipped: true,
      lines: prev.lines,
      messages: [
        "Line extract is not available. Type the line items below.",
      ],
      error: null,
    };
  }

  const note = String(formData.get("note") ?? "").trim();
  if (note.length > MAX_NOTE_CHARS) {
    return {
      ok: false,
      skipped: false,
      lines: prev.lines,
      messages: [],
      error: `Keep the note under ${MAX_NOTE_CHARS} characters.`,
    };
  }

  const file = formData.get("photo");
  let photo: { bytes: Uint8Array; mediaType: string; filename: string } | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO_BYTES) {
      return {
        ok: false,
        skipped: false,
        lines: prev.lines,
        messages: [],
        error: "Photo is over 3.5 MB. Use a smaller image or type the lines.",
      };
    }
    const mediaType = photoMediaType(file);
    if (!mediaType) {
      return {
        ok: false,
        skipped: false,
        lines: prev.lines,
        messages: [],
        error: "Use a JPEG, PNG, or WebP. The file is not stored.",
      };
    }
    photo = {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mediaType,
      filename: file.name || "photo",
    };
  }

  if (!note && !photo) {
    return {
      ok: false,
      skipped: false,
      lines: prev.lines,
      messages: [],
      error: "Paste a note or choose a photo first.",
    };
  }

  const extracted = await extractQuoteLines({ note, photo });
  if (!extracted.ok) {
    return {
      ok: false,
      skipped: false,
      lines: prev.lines,
      messages: [],
      error: extracted.error,
    };
  }

  const messages = [
    `Proposed ${extracted.lines.length} line${extracted.lines.length === 1 ? "" : "s"}. Check amounts before you save. This is not tax advice.`,
    ...(extracted.notes ? [extracted.notes] : []),
    "The photo is not stored.",
  ];

  return { ok: true, skipped: false, lines: extracted.lines, messages, error: null };
}
