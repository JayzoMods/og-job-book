import { describe, expect, it } from "vitest";
import {
  adjacentTourStep,
  isTourStepId,
  TOUR_PARAM,
  TOUR_STEPS,
  tourHref,
  tourStepById,
  tourStepNumber,
} from "./steps";

describe("tour steps", () => {
  it("has unique ids and a tour query param", () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(TOUR_STEPS.length);
    expect(TOUR_PARAM).toBe("tour");
    expect(ids[0]).toBe("welcome");
    expect(ids.at(-1)).toBe("wrap");
  });

  it("rejects empty and unknown ids", () => {
    expect(isTourStepId(null)).toBe(false);
    expect(isTourStepId("")).toBe(false);
    expect(isTourStepId("welcome")).toBe(true);
    expect(tourStepById("nope")).toBeNull();
    expect(tourStepById("welcome")?.title).toMatch(/ledger/i);
  });

  it("builds hrefs onto demo job and share paths", () => {
    const quote = tourStepById("quote-gst");
    const share = tourStepById("share-quote");
    expect(quote).not.toBeNull();
    expect(share).not.toBeNull();
    expect(tourHref(quote!)).toBe(`${quote!.path}?tour=quote-gst`);
    expect(quote!.path).toMatch(/^\/jobs\/[0-9a-f-]{36}$/i);
    expect(tourHref(share!)).toBe(`${share!.path}?tour=share-quote`);
    expect(share!.path).toMatch(/^\/q\//);
  });

  it("walks adjacent steps and stops at the ends", () => {
    expect(adjacentTourStep("welcome", -1)).toBeNull();
    expect(adjacentTourStep("welcome", 1)?.id).toBe("load-demo");
    expect(adjacentTourStep("wrap", 1)).toBeNull();
    expect(adjacentTourStep("wrap", -1)?.id).toBe("recurring");
    expect(tourStepNumber("welcome")).toBe(1);
    expect(tourStepNumber("wrap")).toBe(TOUR_STEPS.length);
  });

  it("does not mention env keys in walkthrough copy", () => {
    const blob = TOUR_STEPS.map((step) => `${step.title} ${step.body} ${step.missing}`).join(
      "\n",
    );
    expect(blob).not.toMatch(/REDIS_URL|RESEND_|STRIPE_|XERO_|CLERK_|AI_GATEWAY|ABR_GUID/);
  });
});
