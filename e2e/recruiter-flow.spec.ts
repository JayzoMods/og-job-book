import { expect, test, type Page } from "@playwright/test";

/**
 * Recruiter path from the product brief: no login, Load demo, GST on a
 * quote/invoice, then create a job → quote → invoice → record payment.
 * Tests share one Postgres; playwright.config.ts keeps workers at 1.
 */

async function loadDemo(page: Page) {
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
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo" }).click();
  await expect(page.getByRole("textbox", { name: "Business name" })).toHaveValue(
    "Harbourline Inspections Pty Ltd",
    { timeout: 30_000 },
  );
}

function createJobForm(page: Page) {
  return page.locator("#create-job");
}

async function submitCreateJob(page: Page) {
  await createJobForm(page).evaluate((el) => {
    const form = el as HTMLFormElement;
    form.noValidate = true;
    form.requestSubmit();
  });
}

test.describe("recruiter flow", () => {
  test("opens with no login, loads demo, and shows GST on quote and invoice", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Load demo" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Password" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /log in|sign in/i })).toHaveCount(0);

    await loadDemo(page);

    await expect(page.getByRole("textbox", { name: "ABN" })).toHaveValue(
      "51 824 753 556",
    );
    await expect(page.getByRole("link", { name: /Tom Nguyen.*quoted/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Priya Shah.*paid/ })).toBeVisible();

    await page.getByRole("link", { name: /Tom Nguyen.*quoted/ }).click();
    await expect(page.getByRole("heading", { name: "Quote Q-0001" })).toBeVisible();

    const quote = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Quote Q-0001" }) });
    await expect(quote.getByText("$110.00").first()).toBeVisible();
    await expect(quote.getByText("$1,232.00").first()).toBeVisible();

    await quote.getByRole("link", { name: "Print / PDF" }).click();
    await expect(page.getByRole("heading", { name: "Quote Q-0001" })).toBeVisible();
    await expect(page.getByText("$110.00").first()).toBeVisible();
    await expect(page.getByText("$1,232.00").first()).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: /Priya Shah.*paid/ }).click();
    const invoice = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Invoice INV-0001" }) });
    await expect(invoice.getByText("$40.00").first()).toBeVisible();
    await expect(invoice.getByText("$440.00").first()).toBeVisible();
    await expect(invoice.getByText("paid", { exact: false }).first()).toBeVisible();
  });

  test("creates a job, quotes GST, invoices, and records the amount due", async ({
    page,
  }) => {
    await loadDemo(page);

    const create = createJobForm(page);
    await create.locator('input[name="customerName"]').fill("Riley Hart");
    await create.locator('input[name="suburb"]').fill("Surry Hills");
    await create.locator('textarea[name="description"]').fill(
      "Recruiter walkthrough inspection",
    );
    await expect(create.locator('input[name="customerName"]')).toHaveValue("Riley Hart");
    await expect(create.locator('textarea[name="description"]')).toHaveValue(
      "Recruiter walkthrough inspection",
    );
    await submitCreateJob(page);
    await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}/i, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Riley Hart" })).toBeVisible();
    await expect(page.getByText("Surry Hills · Recruiter walkthrough inspection")).toBeVisible();

    const addQuote = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Add quote" }) });
    await addQuote.getByLabel("Description 1").fill("Recruiter walkthrough inspection");
    await addQuote.getByLabel("Unit price 1").fill("110.00");
    await addQuote.getByRole("button", { name: "Save draft quote" }).click();

    const draft = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Quote Q-0007" }) });
    await expect(draft.getByText("1/11 $10.00")).toBeVisible();
    await expect(draft.getByText("$10.00").first()).toBeVisible();
    await expect(draft.getByText("$110.00").first()).toBeVisible();

    await draft.getByRole("button", { name: "Send quote" }).click();
    const sent = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Quote Q-0007" }) });
    await sent.getByRole("button", { name: "Accept quote" }).click();

    const accepted = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Quote Q-0007" }) });
    await accepted.getByRole("button", { name: "Issue invoice" }).click();

    const issued = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Invoice INV-0005" }) });
    await expect(issued.getByText("1/11 $10.00")).toBeVisible();
    await expect(issued.getByText("$110.00").first()).toBeVisible();
    await expect(issued.getByText("Retention held $5.50")).toBeVisible();
    await expect(issued.getByText("Amount due $104.50")).toBeVisible();

    await issued.getByRole("button", { name: "Record payment" }).click();
    const paidInvoice = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Invoice INV-0005" }) });
    await expect(paidInvoice.getByText("Balance $0.00")).toBeVisible();
    await expect(paidInvoice.getByText("Recorded $104.50 of $110.00")).toBeVisible();
    await expect(
      page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Riley Hart" }) })
        .getByText("paid", { exact: true }),
    ).toBeVisible();
  });

  test("rejects a job with a description but no customer", async ({ page }) => {
    await loadDemo(page);

    const create = createJobForm(page);
    await create.locator('textarea[name="description"]').fill(
      "Missing customer should not save",
    );
    await submitCreateJob(page);

    await expect(page).toHaveURL(/[?&]error=job/, { timeout: 15_000 });
    await expect(
      page.getByRole("alert").filter({
        hasText: "A job needs a description, and either an existing customer or a name and suburb",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Missing customer should not save/ }),
    ).toHaveCount(0);
  });
});
