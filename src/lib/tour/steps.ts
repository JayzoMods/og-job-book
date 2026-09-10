import { DEMO_IDS } from "../../data/demo-seed";

export const TOUR_PARAM = "tour";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  target: string;
  path: string;
  missing: string;
};

export const TOUR_STEPS = [
  {
    id: "welcome",
    title: "A narrow Australian ledger",
    body: "OG Job Book follows one path: job → quote → invoice → record payment. ABN checksum and GST sit on the document. This walkthrough lights up each part as we go.",
    target: "[data-tour='hero']",
    path: "/",
    missing: "The home hero should be on this page.",
  },
  {
    id: "load-demo",
    title: "Start from a seeded org",
    body: "No login. Load demo fills a fictional Sydney inspection business — Harbourline Inspections — so you can open real jobs, quotes, and invoices instead of an empty book.",
    target: "[data-tour='load-demo']",
    path: "/",
    missing: "Load demo is hidden when sign-in is on. The rest of the tour still works on the jobs list.",
  },
  {
    id: "glance",
    title: "The books at a glance",
    body: "Quoted, invoiced, and paid are live counts from this organisation. They update as documents move — not a dashboard of made-up KPIs.",
    target: "[data-tour='glance']",
    path: "/",
    missing: "These counts appear after Postgres is connected and an organisation exists. Use Load demo first.",
  },
  {
    id: "jobs",
    title: "Jobs are the spine",
    body: "Each card is one job. Status moves enquiry → quoted → invoiced → paid. Open a card to work the quote and invoice. Cancelled and paid jobs stay in the list.",
    target: "[data-tour='jobs']",
    path: "/",
    missing: "The jobs list appears after Load demo, or after you create a job.",
  },
  {
    id: "create-job",
    title: "Create the next job",
    body: "A job needs a description and either an existing customer or a name and suburb. Inspection fields print on the quote and invoice. Job notes stay internal.",
    target: "[data-tour='create-job']",
    path: "/",
    missing: "Create a job sits on the home page once the organisation is saved.",
  },
  {
    id: "customers",
    title: "Customers, not a portal",
    body: "Jobs belong to a customer (name, suburb, optional phone and email). The same customer can have more than one job. Print a statement of account — that sheet is not a tax invoice.",
    target: "[data-tour='customers']",
    path: "/",
    missing: "Customers appear after Load demo or after you create a job.",
  },
  {
    id: "rates",
    title: "Rate card",
    body: "Sell prices for this organisation, with optional cost. Markup is (sell − cost) ÷ cost. Cost is not printed on quotes or invoices. Tick a rate on a job to drop it onto a draft quote.",
    target: "[data-tour='rates']",
    path: "/",
    missing: "The rate card is on the home page once the organisation exists.",
  },
  {
    id: "organisation",
    title: "ABN, GST, and pay details",
    body: "The ABN is checksummed. If GST registered is off, quotes and invoices do not charge GST. Payment terms set the due date on new invoices. PayID and BSB print as entered — we do not check the account.",
    target: "[data-tour='organisation']",
    path: "/",
    missing: "Organisation sits on the home page when Postgres is connected.",
  },
  {
    id: "gst-quarter",
    title: "GST quarter report",
    body: "Print sales GST for an ATO quarter (Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun) by invoice date. Credit notes reduce the totals. Quotes, drafts, and void invoices are left out. This is not a BAS and does not lodge.",
    target: "[data-tour='gst-quarter']",
    path: "/",
    missing: "GST quarter is on the home page once the organisation exists.",
  },
  {
    id: "export",
    title: "Take the books with you",
    body: "Download JSON or CSV. The BAS Check CSV is sales lines in that app’s column order. Job notes and cost are not exported. This download is not a BAS.",
    target: "[data-tour='export']",
    path: "/",
    missing: "Export is on the home page once the organisation exists.",
  },
  {
    id: "job",
    title: "Inside a quoted job",
    body: "Tom Nguyen is the seeded quoted job. The chips jump to quotes, invoices, recurring, inspection, and notes. Duplicate copies the job. A paid job cannot be cancelled.",
    target: "[data-tour='job']",
    path: `/jobs/${DEMO_IDS.jobQuoted}`,
    missing: "This seeded job appears after Load demo. Go back and load the demo, then continue.",
  },
  {
    id: "inspection",
    title: "Inspection fields",
    body: "Property, vendor, purchaser, and report type are optional. They print on the quote and invoice. They are not GPS, not a booking calendar, and not a customer portal.",
    target: "[data-tour='inspection']",
    path: `/jobs/${DEMO_IDS.jobQuoted}`,
    missing: "Inspection sits on the job page after Load demo.",
  },
  {
    id: "quote-gst",
    title: "Quote with GST on the lines",
    body: "Q-0001 is a sent quote. GST on a GST-inclusive line is total ÷ 11 (nearest cent). This quote shows $110.00 GST and $1,232.00 total. Send, print, or share. Drafts stay in this ledger.",
    target: "[data-tour='quote-gst']",
    path: `/jobs/${DEMO_IDS.jobQuoted}`,
    missing: "The mixed-GST quote is on Tom’s job after Load demo.",
  },
  {
    id: "share-quote",
    title: "A share link, not a portal",
    body: "The customer opens this page — the quote only. Accept or decline while it is sent. There is no job list here, and it is not an invoice.",
    target: "[data-tour='share-quote']",
    path: `/q/${DEMO_IDS.quoteMixedShare}`,
    missing: "The share link is minted on sent demo quotes after Load demo.",
  },
  {
    id: "invoice-due",
    title: "Invoice and amount due",
    body: "Alex Moretti has an unpaid invoice. Payment terms set the due date. Record a transfer or cash payment against the amount due. PayID and BSB print on the document as entered.",
    target: "[data-tour='invoice-due']",
    path: `/jobs/${DEMO_IDS.jobInvoiced}`,
    missing: "The unpaid invoice is on Alex’s job after Load demo.",
  },
  {
    id: "invoice-paid",
    title: "Paid, with room for a credit",
    body: "Priya Shah is paid. A credit note can reduce what was owing. Deposits, progress claims, variations, and retention live on jobs that use them — they are not a second product.",
    target: "[data-tour='invoice-paid']",
    path: `/jobs/${DEMO_IDS.jobPaid}`,
    missing: "The paid invoice is on Priya’s job after Load demo.",
  },
  {
    id: "recurring",
    title: "Recurring invoices",
    body: "A line template you issue again on a cadence. Issue one period at a time — issuing does not email. Changing the template does not rewrite invoices already issued.",
    target: "[data-tour='recurring']",
    path: `/jobs/${DEMO_IDS.jobPaid}`,
    missing: "The annual template is on Priya’s job after Load demo.",
  },
  {
    id: "wrap",
    title: "That’s the product",
    body: "From here: Load demo, then create a job → quote → invoice → record payment. Print stays A4. This is not tax advice, and it does not lodge a BAS.",
    target: "[data-tour='hero']",
    path: "/",
    missing: "The home hero should be on this page.",
  },
] as const satisfies readonly TourStep[];

export type TourStepId = (typeof TOUR_STEPS)[number]["id"];

export type TourCatalog = "demo" | "account-setup" | "account-ledger";

const ACCOUNT_SETUP_IDS = ["welcome", "organisation", "wrap"] as const;
const ACCOUNT_LEDGER_IDS = [
  "welcome",
  "glance",
  "jobs",
  "create-job",
  "customers",
  "rates",
  "organisation",
  "gst-quarter",
  "export",
  "wrap",
] as const;

const ACCOUNT_WELCOME_BODY =
  "OG Job Book follows one path: job → quote → invoice → record payment. Books stay on this account. Save the organisation to start. A new account gets 24 hours. Not tax advice.";
const ACCOUNT_WRAP_BODY =
  "Save the organisation if you have not, then create a job → quote → invoice → record payment. Print stays A4. This is not tax advice, and it does not lodge a BAS.";

export function detectTourCatalog(): TourCatalog {
  if (typeof document === "undefined") {
    return "demo";
  }
  if (document.querySelector("form[data-tour='load-demo']")) {
    return "demo";
  }
  if (document.querySelector("[data-tour='glance']")) {
    return "account-ledger";
  }
  return "account-setup";
}

export function tourCatalogSteps(catalog: TourCatalog): TourStep[] {
  const ids =
    catalog === "demo"
      ? TOUR_STEPS.map((step) => step.id)
      : catalog === "account-setup"
        ? ACCOUNT_SETUP_IDS
        : ACCOUNT_LEDGER_IDS;
  return ids.map((id) => {
    const step = tourStepById(id);
    if (!step) {
      throw new Error(`tour_step:${id}`);
    }
    if (catalog === "demo") {
      return step;
    }
    if (id === "welcome") {
      return { ...step, body: ACCOUNT_WELCOME_BODY };
    }
    if (id === "wrap") {
      return { ...step, body: ACCOUNT_WRAP_BODY };
    }
    return step;
  });
}

export function isTourStepId(value: string | null): value is TourStepId {
  return Boolean(value && TOUR_STEPS.some((step) => step.id === value));
}

export function tourStepById(id: string | null): TourStep | null {
  if (!id) {
    return null;
  }
  return TOUR_STEPS.find((step) => step.id === id) ?? null;
}

export function tourHref(step: TourStep): string {
  return `${step.path}?${TOUR_PARAM}=${encodeURIComponent(step.id)}`;
}

export function adjacentTourStep(
  id: string,
  delta: number,
  steps: readonly TourStep[] = TOUR_STEPS,
): TourStep | null {
  const index = steps.findIndex((step) => step.id === id);
  if (index < 0) {
    return null;
  }
  const next = index + delta;
  if (next < 0 || next >= steps.length) {
    return null;
  }
  return steps[next] ?? null;
}

export function tourStepNumber(id: string, steps: readonly TourStep[] = TOUR_STEPS): number {
  return steps.findIndex((step) => step.id === id) + 1;
}

export const TOUR_SYNC_EVENT = "og-job-book-tour";

export function replaceTourUrl(href: string): void {
  window.history.replaceState(window.history.state, "", href);
  window.dispatchEvent(new Event(TOUR_SYNC_EVENT));
}

export function pushTourUrl(href: string): void {
  window.history.pushState(window.history.state, "", href);
  window.dispatchEvent(new Event(TOUR_SYNC_EVENT));
}
