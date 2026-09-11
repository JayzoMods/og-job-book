import { expect, test } from "@playwright/test";

test("how to use is public and shows the contact email", async ({ page }) => {
  await page.goto("/how-to-use");
  await expect(page.getByRole("heading", { name: "How to use OG Job Book" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Step by step" })).toBeVisible();
  await expect(
    page.locator("#main").getByRole("link", { name: "enquiries@ogdigitaldesigns.com.au" }),
  ).toHaveAttribute("href", "mailto:enquiries@ogdigitaldesigns.com.au");
});
