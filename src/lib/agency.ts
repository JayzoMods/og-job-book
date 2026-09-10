export const AGENCY_NAME = "OG Digital Designs";
export const AGENCY_SITE = "https://ogdigitaldesigns.com.au";
export const CONTACT_EMAIL = "enquiries@ogdigitaldesigns.com.au";
export const HOW_TO_USE_PATH = "/how-to-use";

export type HowToUseStep = {
  title: string;
  body: string;
};

export const HOW_TO_USE_STEPS: readonly HowToUseStep[] = [
  {
    title: "Open the books",
    body: "If sign-in is on, create an account. A new account gets 24 hours. If sign-in is off, click Load demo on the home page.",
  },
  {
    title: "Start from a sample, or save the organisation",
    body: "Fill sample books copies a fictional inspection ledger onto this account only — it does not wipe other organisations. Or pick a template on the organisation form and save. You need a business name, address, and ABN. If GST registered is off, quotes and invoices do not charge GST.",
  },
  {
    title: "Create a job",
    body: "A job needs a description and either an existing customer or a name and suburb. Inspection fields print on the quote and invoice. Job notes stay internal.",
  },
  {
    title: "Quote with GST on the lines",
    body: "Add lines with quantity, unit price, and a tax code. Inclusive GST is the total divided by 11 (nearest cent). Exclusive is 10%. Send, print, or share. Drafts stay in this ledger.",
  },
  {
    title: "Invoice and record payment",
    body: "Accept the quote, issue an invoice, then record cash, transfer, or card as a status. PayID and BSB print as entered — we do not check the account.",
  },
  {
    title: "Print and export",
    body: "Print stays A4. The GST quarter report is sales GST by invoice date — not a BAS and it does not lodge. Export JSON, CSV, or a BAS Check-shaped CSV of sales lines.",
  },
];
