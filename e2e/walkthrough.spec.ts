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
  test("opens from the header and highlights the hero, then Load demo", async ({
    page,
  }) => {
    await stripPortal(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Walkthrough" })).toBeVisible();
    await expect(page.getByRole("button", { name: "How it works" })).toBeVisible();

    await page.getByRole("button", { name: "Walkthrough" }).click();
    await expect(page).toHaveURL(/\?tour=welcome/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "A narrow Australian ledger" }),
    ).toBeVisible();
    await expect(page.locator(".tour-spot")).toBeVisible();

    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(page).toHaveURL(/\?tour=load-demo/);
    await expect(
      dialog.getByRole("heading", { name: "Start from a seeded org" }),
    ).toBeVisible();
    await expect(page.locator("[data-tour='load-demo']")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page).not.toHaveURL(/tour=/);
  });

  test("after Load demo, a mid-tour job step highlights the quote", async ({
    page,
  }) => {
    await stripPortal(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Load demo" }).click();
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
