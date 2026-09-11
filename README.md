# OG Job Book

A narrow Australian ledger: **job → quote → invoice → record payment**, with an ABN checksum and GST totals on the actual document. Built as a public portfolio web app by [Jayden O'Grady](https://ogdigitaldesigns.com.au) / OG Digital Designs.

This is **not** ServiceM8, not a BAS agent, not tax advice, and it does not lodge anything with the ATO. It is a focused demonstration of getting the money maths right on a real Australian trade or inspection business's paperwork.

**Live demo:** [og-job-book.vercel.app](https://og-job-book.vercel.app) — sign-in is on there, so create an account and click **Fill sample books** to seed that account only.
**Guide:** [How to use](https://og-job-book.vercel.app/how-to-use)
**Source:** [github.com/JayzoMods/og-job-book](https://github.com/JayzoMods/og-job-book)
**Contact:** [enquiries@ogdigitaldesigns.com.au](mailto:enquiries@ogdigitaldesigns.com.au)

## What it does

**Jobs, quotes, and invoices**
Create a job for a customer (name, suburb, optional phone and email), quote it with line items (quantity, unit — each / hours / m², unit price, tax code), accept the quote, issue the invoice, and record the payment. Optional inspection fields (property, vendor, purchaser, report type) print on the document; job notes stay internal. Duplicating a job copies the customer, description, notes, and inspection fields onto a new enquiry. Revising a quote copies a sent quote into a new numbered draft. An organisation-level rate card holds sell prices (and optional cost, to show markup) that drop straight onto a quote line.

**GST and ABN, done properly**
Every document shows GST, GST-free, and total, with the proof shown next to each GST line. Inclusive GST is 1/11 of the line total (nearest cent); exclusive is 10%. Tax codes are `GST`, `GST_FREE`, `BAS_EXCLUDED`, and `INPUT_TAXED`. GST is only charged when the organisation is GST registered. The ABN on the document is checked against the ABR modulus-89 checksum and any mismatch is flagged in plain English. Quotes and invoices are numbered sequentially (`Q-0001`, `INV-0001`, `CN-0001` for credit notes), quotes carry a valid-until date, and invoices use the organisation's payment terms (due on receipt, or 7/14/30/60 days) with an overdue flag once that date passes.

**Beyond the basic invoice**
Credit notes reduce the amount owing on an invoice using the same GST model — not a refund, and it doesn't touch a BAS. Deposits and progress claims bill a percentage of an accepted quote as one GST-inclusive line; variations add extra billed lines; retention is a hold on billed amounts, not a GST adjustment. Recurring invoices are line templates on a job (weekly, monthly, quarterly, yearly) that are issued one period at a time, either by a click or a scheduled Redis/BullMQ sweep — issuing never sends an email. A sent quote gets a share link (`/q/{token}`) so a customer can view, accept, or decline it without the job URL; drafts are never shared, and the link is a document view, not a portal.

**Printing and exporting**
Print any document as a clean A4 sheet (browser "Save as PDF"), a customer statement of account, or a remittance advice for a recorded payment. A GST-quarter report totals sales GST by invoice date for one of the four ATO quarters — useful for bookkeeping, but it is not a BAS and does not lodge anything. Export the whole ledger as JSON, CSV, or a CSV shaped for the column order used by [BAS Check](https://bas-check.vercel.app) (that app analyses GST coding risk; this one does not).

**Optional integrations (all off by default)**
A few features only turn on once their environment variables are set, so the public no-login demo stays safe to click around:

| Feature | Turns on when | Notes |
| --- | --- | --- |
| Live ABR lookup of the org ABN | `ABR_GUID` is set | Single lookup, not a bulk list. The checksum still runs without it. |
| AI-assisted line extraction from a note or photo | `AI_GATEWAY_API_KEY` is set | The uploaded file is never stored. Not a chatbot. |
| Email a sent quote / live invoice via Resend | `RESEND_API_KEY` and `EMAIL_FROM` are set | |
| Card payment via Stripe Checkout | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set | Charges the amount due now, not the full invoice. |
| Post a live invoice to Xero or MYOB | Xero (`XERO_ACCESS_TOKEN`, `XERO_TENANT_ID`) or MYOB (`MYOB_ACCESS_TOKEN`, `MYOB_CLIENT_ID`, `MYOB_CF_URI`) tokens are set | Credit notes go to Xero only. Token exchange (OAuth) is out of scope. |
| First-party sign-in, one organisation per account | `AUTH_SECRET` (32+ characters) is set | New trials from the same network are rate-limited to one per 24 hours. |
| Due-invoice queue via Redis/BullMQ | `REDIS_URL` is set | |

## Run it locally

```bash
docker compose up -d
cp .env.example .env.local
npm install
npm run db:apply
npm run db:seed
npm test
npx playwright install chromium
npm run test:e2e
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) and click **Load demo** (safe to click again — it just resets the demo data).

A few things worth knowing:

- **Windows + Turbopack:** `npm run dev` runs on Webpack here because Turbopack has failed to junction the `pg` package on this volume. Vercel and CI still build with the Next.js default.
- **Ports:** local Postgres listens on host port **5433** (not 5432) so it can sit alongside other local databases. The local Redis queue (when used) maps to **6380**.
- **Migrations:** the schema lives in `src/db/schema.ts`. `npm run db:generate` writes the drizzle-kit SQL and journal; `npm run db:apply` applies it (same migrator as `drizzle-kit migrate`); `npm run db:check` fails the build if the schema and journal have drifted apart.
- **E2E tests:** `npm run test:e2e` needs Postgres running (same requirement as Load demo). Locally it reuses an already-running `npm run dev` on port 3000; GitHub Actions runs it against a production build (`npm run build` then `npm run start`).

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4
- Drizzle ORM + drizzle-kit migrations, PostgreSQL 18
- Vitest — ABN checksum, GST rounding, tax-code flags, seed-data shape, ABR lookup, payment-webhook parsing, Resend/Stripe/Xero/MYOB request composition, quote share-token handling, inspection fields, auth/trial/tenant parsing, Redis/BullMQ job parsing, GST-quarter parsing
- Playwright (Chromium) — the recruiter path end to end: no login, Load demo, GST shown on the document, job → quote → invoice → record payment
- GitHub Actions — drizzle-kit check, apply migrations, seed, unit tests, lint, build, Playwright

## HTTP API

Full OpenAPI 3.1 spec is served at `/openapi.yaml` once the app is running (for example [http://localhost:3000/openapi.yaml](http://localhost:3000/openapi.yaml)).

| Endpoint | What it does |
| --- | --- |
| `POST /api/payment-webhook` | Records a payment (`{ invoiceId, amountCents, paidOn, method }`) using the same remaining-due maths as the form, including credits and retention held. Not a live card charge, and not Confirmation of Payee. |
| `POST /api/stripe-checkout` | Starts a Stripe Checkout Session for the amount currently due on an invoice (`{ invoiceId }`, AUD). Off until `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set. |
| `POST /api/stripe-webhook` | The Stripe endpoint. Verifies the `Stripe-Signature` header and records a `checkout.session.completed` event as a card payment; a retry once the amount due is already zero is accepted but not applied twice. |
| `POST /api/send-email` | Emails a sent quote or live invoice to the customer via Resend (`{ kind: "quote" \| "invoice", id }`). Off until `RESEND_API_KEY` and `EMAIL_FROM` are set. |
| `POST /api/accounting-write` | Posts a live invoice — full lines, not just the amount due now — to Xero or MYOB (`{ provider: "xero" \| "myob", kind: "invoice" \| "credit", id }`). Credit notes go to Xero only. Off until the relevant tokens are set. |
| `POST /api/quote-share` | Mints or rotates a share token for a sent quote (`{ quoteId, rotate? }`), openable at `GET /q/{token}`. Drafts are never shared. |
| `POST /api/queue-run` | Queues due recurring invoices on Redis/BullMQ and issues one period each (`{}` or `{ kind: "sweep" }`). Off until `REDIS_URL` is set; run `npm run queue:worker` for the long-lived worker. |
| `GET /api/export?format=json\|csv\|bas-check` | Downloads the ledger. |

All of the above are off by default; leave their environment variables unset on a public, no-login deploy.

## The ABN check

Follows the ABR's [Help — Format of the ABN](https://abr.business.gov.au/Help/AbnFormat): subtract 1 from the first digit, weight the eleven digits `10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19`, and the sum must be divisible by 89. Worked example: `51 824 753 556`.

## Out of scope for v1

Scheduling, GPS tracking, a staff roster, a customer portal, inventory, a native app, Xero OAuth token exchange, Hubdoc, and BAS lodgement. First-party sign-in exists but is switched off on the public recruiter demo.
