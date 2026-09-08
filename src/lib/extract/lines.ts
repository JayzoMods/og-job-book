import { generateText, Output } from "ai";
import { z } from "zod";
import { dollarsToCents, parseAudAmount } from "../ledger/money";
import {
  parseAmountKind,
  parseLineUnit,
  parseTaxCode,
  type AmountKind,
  type LineUnit,
  type TaxCode,
} from "../ledger/tax";

/** Cheap vision model listed on AI Gateway 8 Sep 2026. Same id BAS Check uses for file extract. */
export const LINE_EXTRACT_MODEL = "google/gemini-3.5-flash-lite";

/** Under the 4mb Server Action cap, with room for multipart headers. */
export const MAX_PHOTO_BYTES = 3_500_000;
export const MAX_NOTE_CHARS = 4000;
export const MAX_PROPOSED_LINES = 12;

const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const proposedLineSchema = z.object({
  description: z.string().describe("Sellable line as written. Empty if not a quote line."),
  quantity: z.coerce.number().describe("Quantity. Use 1 if a single item."),
  unitPriceAud: z
    .string()
    .describe("Unit price in AUD as written. Empty if the price is not visible or stated. Do not invent."),
  taxCode: z
    .enum(["GST", "GST_FREE", "BAS_EXCLUDED", "INPUT_TAXED"])
    .describe("GST unless the note or photo clearly says otherwise."),
  amountKind: z
    .enum(["inclusive", "exclusive"])
    .describe("inclusive unless the note or photo says the amount is GST-exclusive."),
  unit: z
    .enum(["each", "hours", "m2"])
    .optional()
    .describe("each unless the note or photo says hours or square metres."),
});

export const lineExtractSchema = z.object({
  lines: z.array(proposedLineSchema).describe("Quote lines only. Empty if nothing is a sellable line."),
  notes: z.string().describe("What was unclear. Empty if the read was straightforward."),
});

export type LineExtractOutput = z.infer<typeof lineExtractSchema>;

export type ProposedLine = {
  description: string;
  quantity: number;
  unit: LineUnit;
  unitPriceCents: number;
  taxCode: TaxCode;
  amountKind: AmountKind;
};

export function extractAiConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.AI_GATEWAY_API_KEY?.trim());
}

export function photoMediaType(file: { type: string; name: string }): string | null {
  const type = file.type.trim().toLowerCase();
  if (ALLOWED_PHOTO_TYPES.has(type)) {
    return type;
  }
  const name = file.name.trim().toLowerCase();
  if (name.endsWith(".png")) {
    return "image/png";
  }
  if (name.endsWith(".webp")) {
    return "image/webp";
  }
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return null;
}

export function normaliseProposedLines(raw: LineExtractOutput["lines"]): ProposedLine[] {
  const lines: ProposedLine[] = [];
  for (const row of raw) {
    if (lines.length >= MAX_PROPOSED_LINES) {
      break;
    }
    const description = row.description.trim();
    if (description === "") {
      continue;
    }
    if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
      continue;
    }
    const dollars = parseAudAmount(row.unitPriceAud);
    if (dollars === null || dollars <= 0) {
      continue;
    }
    lines.push({
      description,
      quantity: row.quantity,
      unit: parseLineUnit(row.unit),
      unitPriceCents: dollarsToCents(dollars),
      taxCode: parseTaxCode(row.taxCode) ?? "GST",
      amountKind: parseAmountKind(row.amountKind),
    });
  }
  return lines;
}

export type LineGenerateFn = (input: {
  note: string;
  photo?: { mediaType: string; data: Uint8Array; filename: string };
}) => Promise<LineExtractOutput | null>;

export async function defaultLineGenerate(input: {
  note: string;
  photo?: { mediaType: string; data: Uint8Array; filename: string };
}): Promise<LineExtractOutput | null> {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; mediaType: string; data: Uint8Array; filename: string }
  > = [
    {
      type: "text",
      text:
        input.note && input.photo
          ? `Propose quote line items from this note and photo. Only lines you can see or that the note states. Do not invent prices.\n${input.note}`
          : input.note
            ? `Propose quote line items from this note:\n${input.note}`
            : "Propose quote line items from this photo. Only lines you can see. Do not invent prices.",
    },
  ];
  if (input.photo) {
    content.push({
      type: "file",
      mediaType: input.photo.mediaType,
      data: input.photo.data,
      filename: input.photo.filename,
    });
  }

  const { output } = await generateText({
    model: LINE_EXTRACT_MODEL,
    instructions:
      "Propose Australian quote line items for a trade or inspection job. Extract only what is in the note or photo. Empty lines if nothing is a sellable item. Do not invent prices. Unit is each unless the note or photo says hours or square metres. Not a chatbot. Not tax advice. Not a BAS lodgement.",
    output: Output.object({
      name: "QuoteLineItems",
      schema: lineExtractSchema,
    }),
    messages: [{ role: "user", content }],
  });
  return output ?? null;
}

export async function extractQuoteLines(
  input: {
    note: string;
    photo?: { bytes: Uint8Array; mediaType: string; filename: string };
  },
  generate: LineGenerateFn = defaultLineGenerate,
): Promise<
  | { ok: true; lines: ProposedLine[]; notes: string }
  | { ok: false; error: string }
> {
  try {
    const fields = await generate({
      note: input.note,
      photo: input.photo
        ? {
            mediaType: input.photo.mediaType,
            data: input.photo.bytes,
            filename: input.photo.filename,
          }
        : undefined,
    });
    if (!fields) {
      return {
        ok: false,
        error: "Could not propose lines from that note or photo. Type the lines instead.",
      };
    }
    const lines = normaliseProposedLines(fields.lines);
    if (lines.length === 0) {
      return {
        ok: false,
        error: "No usable line items (need a description, qty, and a price). Type them instead.",
      };
    }
    return { ok: true, lines, notes: fields.notes.trim() };
  } catch {
    return {
      ok: false,
      error: "Line extract failed. Type the lines, or try again.",
    };
  }
}
