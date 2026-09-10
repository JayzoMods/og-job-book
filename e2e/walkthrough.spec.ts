import { expect, test, type Page } from "@playwright/test";

async function stripPortal(page: Page) {
  await page.addInitScript(() => {
    const sweep = () => {
      document.querySelectorAll("nextjs-portal").forEach((node) => node.remove());
    };
    sweep();
    new MutationObserver(sweep).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

test.describe("product walkthrough", () => {
  test("opens from the header and highlights the hero, then the next home step", async ({
    page,
  }) => {
    await stripPortal(page);
    await page.goto("/");
    const howItWorks = page.getByRole("button", { name: "How it works" });
    await expect(page.getByRole("button", { name: "Walkthrough" })).toBeVisible();
    if (await page.getByRole("link", { name: "Sign in" }).count()) {
      await expect(howItWorks).toHaveCount(0);
      return;
    }
    await expect(howItWorks).toBeVisible();

    await page.getByRole("button", { name: "Walkthrough" }).click();
    await expect(page).toHaveURL(/\?tour=welcome/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "A narrow Australian ledger" }),
    ).toBeVisible();
    await expect(page.locator(".tour-spot")).toBeVisible();

    await dialog.getByRole("button", { name: "Next" }).click();
    if (await page.locator("form[data-tour='load-demo']").count()) {
      await expect(page).toHaveURL(/\?tour=load-demo/);
      await expect(
        dialog.getByRole("heading", { name: "Start from a seeded org" }),
      ).toBeVisible();
      await expect(page.locator("[data-tour='load-demo']")).toBeVisible();
    } else if (await page.locator("form[data-tour='fill-template']").count()) {
      await expect(page).toHaveURL(/\?tour=fill-template/);
      await expect(
        dialog.getByRole("heading", { name: "Fill sample books" }),
      ).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\?tour=organisation/);
      await expect(
        dialog.getByRole("heading", { name: "ABN, GST, and pay details" }),
      ).toBeVisible();
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page).not.toHaveURL(/tour=/);
    const hero = page.locator("[data-tour='hero']");
    const heading = hero.getByRole("heading", { level: 1 });
    const heroBox = await hero.boundingBox();
    const headingBox = await heading.boundingBox();
    expect(heroBox).toBeTruthy();
    expect(headingBox).toBeTruthy();
    expect(headingBox!.y).toBeGreaterThanOrEqual(heroBox!.y - 4);
    expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(heroBox!.x + heroBox!.width + 8);
  });

  test("after Load demo, a mid-tour job step highlights the quote", async ({
    page,
  }) => {
    await stripPortal(page);
    await page.goto("/");
    const loadDemo = page.getByRole("button", { name: "Load demo" });
    if ((await loadDemo.count()) === 0) {
      test.skip(true, "Load demo is off while sign-in is on.");
      return;
    }
    await loadDemo.click();
    await expect(page.getByRole("textbox", { name: "Business name" })).toHaveValue(
      "Harbourline Inspections Pty Ltd",
      { timeout: 30_000 },
    );

    await page.goto("/?tour=quote-gst");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(
      dialog.getByRole("heading", { name: "Quote with GST on the lines" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quote Q-0001" })).toBeVisible();
    await expect(page.locator("[data-tour='quote-gst']")).toBeVisible();
    await expect(page.locator(".tour-spot")).toBeVisible();
  });
});
