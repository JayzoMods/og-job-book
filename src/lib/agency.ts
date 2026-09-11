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
    body: "No account? Click Load demo on the home page and you’re straight in. Signing up instead starts a free 24-hour trial on your own account.",
  },
  {
    title: "Start from a sample, or set up your own organisation",
    body: "Fill sample books drops a fictional inspection ledger onto your account only — it never touches anyone else’s organisation. Prefer your own details? Pick a template on the organisation form, then save with a business name, address, and ABN. Turn GST registered off and quotes and invoices stop charging GST.",
  },
  {
    title: "Create a job",
    body: "A job needs a description, plus either an existing customer or a new name and suburb. Optional inspection fields (property, vendor, purchaser, report type) print on the quote and invoice. Job notes are for your eyes only.",
  },
  {
    title: "Quote it, with GST worked out on every line",
    body: "Add lines with a quantity, unit price, and tax code. Inclusive GST is simply the total divided by 11, rounded to the nearest cent; exclusive GST is 10% on top. Send the quote, print it, or share a link — drafts stay private to your ledger.",
  },
  {
    title: "Issue the invoice and record the payment",
    body: "Accept the quote, issue the invoice, then record cash, transfer, or card payment as they come in. PayID and BSB details print exactly as entered — this is a display only, not a live bank check.",
  },
  {
    title: "Print, and export when you need to",
    body: "Every document prints cleanly on A4. A GST-quarter report totals sales GST by invoice date for your own records — it is not a BAS and does not lodge anything. Export the whole ledger as JSON, CSV, or a BAS Check-shaped CSV of sales lines.",
  },
];
