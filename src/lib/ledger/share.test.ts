import { describe, expect, it } from "vitest";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import { computeDocument } from "./tax";
import {
  SHARE_TOKEN_BYTES,
  SHARE_TOKEN_LENGTH,
  canRespondToSharedQuote,
  canShareQuote,
  describeQuoteShareSkip,
  generateShareToken,
  parseQuoteShare,
  parseShareToken,
  quoteSharePath,
  quoteShareRejectStatus,
  quoteShareSkipReason,
  quoteShareUrl,
  resolveShareToken,
} from "./share";

const Q_0001 = demoSeed.quotes.find((row) => row.docNumber === "Q-0001");
const Q_0003 = demoSeed.quotes.find((row) => row.docNumber === "Q-0003");
const Q_0006 = demoSeed.quotes.find((row) => row.docNumber === "Q-0006");

function tokenFromBytes(fill: number): { bytes: Buffer; token: string } {
  const bytes = Buffer.alloc(SHARE_TOKEN_BYTES, fill);
  return { bytes, token: bytes.toString("base64url") };
}

describe("parseShareToken", () => {
  it("rejects empty, junk, UUIDs, and wrong length", () => {
    expect(parseShareToken("")).toBeNull();
    expect(parseShareToken("   ")).toBeNull();
    expect(parseShareToken(null)).toBeNull();
    expect(parseShareToken(undefined)).toBeNull();
    expect(parseShareToken("abc")).toBeNull();
    expect(parseShareToken(DEMO_IDS.quoteMixed)).toBeNull();
    expect(parseShareToken("q0001ShareDemoHarbourlineInspections00001x")).toBeNull();
    expect(parseShareToken("q0001ShareDemoHarbourlineInspections00001xxx")).toBeNull();
    expect(parseShareToken("q0001ShareDemoHarbourlineInspections00001.x")).toBeNull();
  });

  it("accepts the Q-0001 demo token", () => {
    expect(parseShareToken(DEMO_IDS.quoteMixedShare)).toBe(DEMO_IDS.quoteMixedShare);
    expect(DEMO_IDS.quoteMixedShare).toHaveLength(SHARE_TOKEN_LENGTH);
    expect(parseShareToken(`  ${DEMO_IDS.quoteMixedShare}  `)).toBe(
      DEMO_IDS.quoteMixedShare,
    );
  });
});

describe("generateShareToken", () => {
  it("encodes 32 bytes as 43-character base64url", () => {
    const { bytes, token } = tokenFromBytes(0x61);
    expect(token).toHaveLength(SHARE_TOKEN_LENGTH);
    expect(generateShareToken(() => bytes)).toBe(token);
    expect(parseShareToken(token)).toBe(token);
  });
});

describe("quoteSharePath and quoteShareUrl", () => {
  it("builds /q/{token} and strips a trailing origin slash", () => {
    expect(quoteSharePath("abc")).toBe("");
    expect(quoteSharePath(DEMO_IDS.quoteMixedShare)).toBe(
      `/q/${DEMO_IDS.quoteMixedShare}`,
    );
    expect(quoteShareUrl("", DEMO_IDS.quoteMixedShare)).toBe(
      `/q/${DEMO_IDS.quoteMixedShare}`,
    );
    expect(
      quoteShareUrl("https://og-job-book.vercel.app/", DEMO_IDS.quoteMixedShare),
    ).toBe(`https://og-job-book.vercel.app/q/${DEMO_IDS.quoteMixedShare}`);
  });
});

describe("canShareQuote and canRespondToSharedQuote", () => {
  it("shares live quotes, not drafts; accept/decline only while sent", () => {
    expect(canShareQuote("draft")).toBe(false);
    expect(canShareQuote("")).toBe(false);
    expect(canShareQuote("sent")).toBe(true);
    expect(canShareQuote("accepted")).toBe(true);
    expect(canShareQuote("declined")).toBe(true);
    expect(canShareQuote("superseded")).toBe(true);
    expect(canRespondToSharedQuote("sent")).toBe(true);
    expect(canRespondToSharedQuote("accepted")).toBe(false);
    expect(canRespondToSharedQuote("draft")).toBe(false);
    expect(canRespondToSharedQuote("superseded")).toBe(false);
  });
});

describe("quoteShareSkipReason", () => {
  it("blocks drafts and allows Q-0001", () => {
    expect(quoteShareSkipReason({ status: "draft" })).toBe("not_shareable");
    expect(quoteShareSkipReason({ status: "sent" })).toBeNull();
    expect(Q_0001?.status).toBe("sent");
    expect(quoteShareSkipReason({ status: Q_0001?.status ?? "" })).toBeNull();
    expect(Q_0003?.status).toBe("draft");
    expect(quoteShareSkipReason({ status: Q_0003?.status ?? "" })).toBe("not_shareable");
    expect(Q_0006?.status).toBe("draft");
  });
});

describe("describeQuoteShareSkip", () => {
  it("explains draft vs missing without calling it a customer portal", () => {
    expect(describeQuoteShareSkip("not_shareable")).toMatch(/Drafts/);
    expect(describeQuoteShareSkip("missing")).toMatch(/not here/);
    expect(describeQuoteShareSkip("not_shareable")).not.toMatch(/customer portal/i);
  });
});

describe("resolveShareToken", () => {
  it("keeps an existing token unless rotate is set", () => {
    const { bytes, token } = tokenFromBytes(0x62);
    expect(
      resolveShareToken({
        existing: DEMO_IDS.quoteMixedShare,
        rotate: false,
        randomBytesImpl: () => bytes,
      }),
    ).toBe(DEMO_IDS.quoteMixedShare);
    expect(
      resolveShareToken({
        existing: DEMO_IDS.quoteMixedShare,
        rotate: true,
        randomBytesImpl: () => bytes,
      }),
    ).toBe(token);
    expect(
      resolveShareToken({
        existing: null,
        rotate: false,
        randomBytesImpl: () => bytes,
      }),
    ).toBe(token);
  });
});

describe("parseQuoteShare", () => {
  it("rejects empty and junk bodies", () => {
    expect(parseQuoteShare(null).ok).toBe(false);
    expect(parseQuoteShare(undefined).ok).toBe(false);
    expect(parseQuoteShare("").ok).toBe(false);
    expect(parseQuoteShare({}).ok).toBe(false);
    expect(parseQuoteShare({ quoteId: "not-a-uuid" }).ok).toBe(false);
  });

  it("accepts Q-0001 and strips extra keys", () => {
    expect(parseQuoteShare({ quoteId: DEMO_IDS.quoteDraft })).toEqual({
      ok: true,
      payload: { quoteId: DEMO_IDS.quoteDraft, rotate: false },
    });
    expect(
      parseQuoteShare({ quoteId: DEMO_IDS.quoteMixed, rotate: true, extra: 1 }),
    ).toEqual({
      ok: true,
      payload: { quoteId: DEMO_IDS.quoteMixed, rotate: true },
    });
  });
});

describe("quoteShareRejectStatus", () => {
  it("uses 404 for missing and 409 for drafts", () => {
    expect(quoteShareRejectStatus("missing")).toBe(404);
    expect(quoteShareRejectStatus("not_shareable")).toBe(409);
  });
});

describe("demo share tokens", () => {
  it("gives live quotes tokens and leaves drafts blank without changing Q-0001 money", () => {
    if (!Q_0001) {
      throw new Error("missing Q-0001");
    }
    expect(computeDocument(Q_0001.lines).gstCents).toBe(11000);
    expect(computeDocument(Q_0001.lines).totalCents).toBe(123200);
    expect(Q_0001.shareToken).toBe(DEMO_IDS.quoteMixedShare);
    expect(Q_0003?.shareToken ?? null).toBeNull();
    expect(Q_0006?.shareToken ?? null).toBeNull();
    const live = demoSeed.quotes.filter((quote) => canShareQuote(quote.status));
    expect(live.map((quote) => quote.docNumber)).toEqual([
      "Q-0001",
      "Q-0002",
      "Q-0004",
      "Q-0005",
    ]);
    const tokens = live.map((quote) => quote.shareToken);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of tokens) {
      expect(parseShareToken(token)).toBe(token);
    }
  });
});
