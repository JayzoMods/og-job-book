import { describe, expect, it } from "vitest";
import {
  adjacentTourStep,
  detectTourCatalog,
  isTourStepId,
  TOUR_PARAM,
  TOUR_STEPS,
  tourCatalogSteps,
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

  it("uses a short signed-in catalog that stays on home", () => {
    const setup = tourCatalogSteps("account-setup");
    expect(setup.map((step) => step.id)).toEqual([
      "welcome",
      "fill-template",
      "organisation",
      "wrap",
    ]);
    expect(setup.every((step) => step.path === "/")).toBe(true);
    expect(setup[0]?.body).toMatch(/Fill sample books/i);
    expect(setup.at(-1)?.body).not.toMatch(/Load demo/i);
    expect(adjacentTourStep("welcome", 1, setup)?.id).toBe("fill-template");
    expect(tourStepNumber("organisation", setup)).toBe(3);

    const demo = tourCatalogSteps("demo");
    expect(demo.map((step) => step.id)).not.toContain("fill-template");
    expect(demo[1]?.id).toBe("load-demo");

    const ledger = tourCatalogSteps("account-ledger");
    expect(ledger.map((step) => step.id)).not.toContain("load-demo");
    expect(ledger.every((step) => step.path === "/")).toBe(true);
  });

  it("defaults to the demo catalog when there is no document", () => {
    expect(detectTourCatalog()).toBe("demo");
  });
});
