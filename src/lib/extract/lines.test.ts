import { describe, expect, it, vi } from "vitest";
import {
  extractAiConfigured,
  extractQuoteLines,
  MAX_PHOTO_BYTES,
  normaliseProposedLines,
  photoMediaType,
} from "./lines";

describe("extractAiConfigured", () => {
  it("treats a blank key as off", () => {
    expect(extractAiConfigured({})).toBe(false);
    expect(extractAiConfigured({ AI_GATEWAY_API_KEY: "  " })).toBe(false);
    expect(extractAiConfigured({ AI_GATEWAY_API_KEY: "vk-test" })).toBe(true);
    expect(extractAiConfigured({ VERCEL: "1" })).toBe(false);
  });
});

describe("photoMediaType", () => {
  it("accepts jpeg png webp", () => {
    expect(photoMediaType({ type: "image/jpeg", name: "a.jpg" })).toBe("image/jpeg");
    expect(photoMediaType({ type: "image/png", name: "a.png" })).toBe("image/png");
    expect(photoMediaType({ type: "image/webp", name: "a.webp" })).toBe("image/webp");
  });

  it("falls back to the filename when the browser omits a type", () => {
    expect(photoMediaType({ type: "", name: "scan.JPEG" })).toBe("image/jpeg");
  });

  it("rejects pdf and csv — this is not Hubdoc", () => {
    expect(photoMediaType({ type: "application/pdf", name: "note.pdf" })).toBeNull();
    expect(photoMediaType({ type: "text/csv", name: "rows.csv" })).toBeNull();
    expect(photoMediaType({ type: "", name: "" })).toBeNull();
  });
});

describe("normaliseProposedLines", () => {
  it("keeps a complete GST-inclusive line and converts AUD to cents", () => {
    expect(
      normaliseProposedLines([
        {
          description: " Storm inspection ",
          quantity: 1,
          unitPriceAud: "330.00",
          taxCode: "GST",
          amountKind: "inclusive",
        },
      ]),
    ).toEqual([
      {
        description: "Storm inspection",
        quantity: 1,
        unit: "each",
        unitPriceCents: 33000,
        taxCode: "GST",
        amountKind: "inclusive",
      },
    ]);
  });

  it("drops empty description, non-positive qty, and missing price", () => {
    expect(
      normaliseProposedLines([
        {
          description: "  ",
          quantity: 1,
          unitPriceAud: "10.00",
          taxCode: "GST",
          amountKind: "inclusive",
        },
        {
          description: "Labour",
          quantity: 0,
          unitPriceAud: "10.00",
          taxCode: "GST",
          amountKind: "inclusive",
        },
        {
          description: "Call-out",
          quantity: 1,
          unitPriceAud: "",
          taxCode: "GST",
          amountKind: "inclusive",
        },
      ]),
    ).toEqual([]);
  });

  it("keeps GST-free exclusive lines when they are complete", () => {
    expect(
      normaliseProposedLines([
        {
          description: "First-aid booklet",
          quantity: 2,
          unitPriceAud: "11.00",
          taxCode: "GST_FREE",
          amountKind: "exclusive",
        },
      ]),
    ).toEqual([
      {
        description: "First-aid booklet",
        quantity: 2,
        unit: "each",
        unitPriceCents: 1100,
        taxCode: "GST_FREE",
        amountKind: "exclusive",
      },
    ]);
  });

  it("keeps hours and m² when the model names them", () => {
    expect(
      normaliseProposedLines([
        {
          description: "On-site time",
          quantity: 2.5,
          unitPriceAud: "132.00",
          taxCode: "GST",
          amountKind: "inclusive",
          unit: "hours",
        },
        {
          description: "Roof measure",
          quantity: 12,
          unitPriceAud: "11.00",
          taxCode: "GST",
          amountKind: "inclusive",
          unit: "m2",
        },
      ]),
    ).toEqual([
      {
        description: "On-site time",
        quantity: 2.5,
        unit: "hours",
        unitPriceCents: 13200,
        taxCode: "GST",
        amountKind: "inclusive",
      },
      {
        description: "Roof measure",
        quantity: 12,
        unit: "m2",
        unitPriceCents: 1100,
        taxCode: "GST",
        amountKind: "inclusive",
      },
    ]);
  });

  it("caps at 12 lines", () => {
    const raw = Array.from({ length: 15 }, (_, i) => ({
      description: `Line ${i + 1}`,
      quantity: 1,
      unitPriceAud: "1.00",
      taxCode: "GST" as const,
      amountKind: "inclusive" as const,
    }));
    expect(normaliseProposedLines(raw)).toHaveLength(12);
  });
});

describe("extractQuoteLines", () => {
  it("returns usable lines from a mocked model", async () => {
    const result = await extractQuoteLines(
      { note: "1x roof inspect $330 incl GST" },
      async () => ({
        lines: [
          {
            description: " Roof inspect ",
            quantity: 1,
            unitPriceAud: "330",
            taxCode: "GST",
            amountKind: "inclusive",
          },
        ],
        notes: "  ",
      }),
    );
    expect(result).toEqual({
      ok: true,
      notes: "",
      lines: [
        {
          description: "Roof inspect",
          quantity: 1,
          unit: "each",
          unitPriceCents: 33000,
          taxCode: "GST",
          amountKind: "inclusive",
        },
      ],
    });
  });

  it("does not invent a line when the model returns blanks", async () => {
    const result = await extractQuoteLines({ note: "unclear scribble" }, async () => ({
      lines: [
        {
          description: "",
          quantity: 1,
          unitPriceAud: "",
          taxCode: "GST",
          amountKind: "inclusive",
        },
      ],
      notes: "Nothing priced",
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/No usable line/i);
    }
  });

  it("returns a generic error when generate throws, without the throw text", async () => {
    const generate = vi.fn(async () => {
      throw new Error("AI_GATEWAY_API_KEY vk-secret failed");
    });
    const result = await extractQuoteLines({ note: "inspect" }, generate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toMatch(/vk-secret|AI_GATEWAY/);
    }
  });
});

describe("limits", () => {
  it("keeps the photo cap under the 4mb action body", () => {
    expect(MAX_PHOTO_BYTES).toBeLessThan(4_000_000);
  });
});
