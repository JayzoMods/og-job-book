# OG Job Book

Job → quote → invoice → record payment, with Australian ABN checksum and GST totals on the documents. Public portfolio web app for [Jayden O'Grady](https://ogdigitaldesigns.com.au) / OG Digital Designs.

**Live demo:** [https://og-job-book.vercel.app](https://og-job-book.vercel.app). With sign-in off, click **Load demo**. With sign-in on, create an account and click **Fill sample books** (that account only). [How to use](https://og-job-book.vercel.app/how-to-use). Contact [enquiries@ogdigitaldesigns.com.au](mailto:enquiries@ogdigitaldesigns.com.au). Source: [github.com/JayzoMods/og-job-book](https://github.com/JayzoMods/og-job-book).

This is **not** ServiceM8, not a BAS agent, not tax advice, and it does not lodge with the ATO.

## What it does

1. Load a seeded fictional Sydney inspection org (**Load demo** without sign-in, or **Fill sample books** on a signed-in account). Organisation and job forms also have fill templates. Or create jobs yourself.
2. Add line items on a quote: quantity, unit (each, hours, or m²), unit price, tax code (`GST` | `GST_FREE` | `BAS_EXCLUDED` | `INPUT_TAXED`). Jobs belong to a customer (name, suburb, optional phone and email). Optional inspection fields (property, vendor, purchaser, report type) print on the quote and invoice. Job notes are internal and are not printed. This app does not call or SMS. Email of a sent quote or live invoice is off until `RESEND_API_KEY` and `EMAIL_FROM` are set. Duplicate job copies the customer, description, notes, and inspection fields onto a new enquiry. Revise quote copies a sent quote into a new numbered draft. An organisation rate card holds sell prices you can drop onto a quote (qty 1). Optional cost on a rate or quote line shows markup as (sell − cost) ÷ cost. Cost is not printed.
3. Documents show GST, GST-free, and total. Inclusive GST is 1/11 (nearest cent). Exclusive is 10%. Each GST line shows that proof. If the org is not GST registered, GST is not charged. Quotes are numbered `Q-0001`, invoices `INV-0001`, credit notes `CN-0001`. Quotes have a valid-until date. Invoices use the org payment terms (due on receipt, 7, 14, 30, or 60 days) and flag overdue when unpaid past the due date. A credit note reduces the amount owing on an invoice (same GST line model). It is not a refund and does not lodge a BAS. Deposits and progress claims bill a percent of an accepted quote as one GST-inclusive line. Variations are extra lines. Retention is a hold, not a GST adjustment. Print a customer statement of account (not a tax invoice) and a remittance advice for a recorded payment (not Confirmation of Payee). Print a GST quarter report of sales GST by invoice date (not a BAS, not lodgement).
4. ABN on the quote/invoice uses the ABR modulus-89 checksum. Invalid checksums are flagged in plain English. Optional live ABR lookup of the organisation ABN (entity name and GST date) when `ABR_GUID` is set. One ABN, not a bulk list. Checksum still runs when the GUID is unset.
5. Accept a quote, issue an invoice, record a payment (cash / transfer / card — status only via the form or `POST /api/payment-webhook`). Pay with card starts Stripe Checkout for the amount due now when `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set; `POST /api/stripe-webhook` records that card payment. After an accepted quote you can also issue a deposit, progress claim, variation, or retention release. Retention is a hold of billed amounts, stamped on the invoice. Recurring invoices are line templates on a job (weekly, monthly, quarterly, or yearly). Issue is a click, or a Redis/BullMQ sweep when `REDIS_URL` is set. Issuing does not email. Recurring invoices do not reduce quote remaining and do not hold retention. Email quote / email invoice posts the document via Resend when configured. Send to Xero / Send to MYOB posts a live invoice (full lines, not amount due now) when tokens are set. Credit notes go to Xero only. Not OAuth. A sent quote has a share link (`/q/{token}`) so it can be opened without the job URL. Drafts are not shared. Accept and decline work on that link. Not a customer portal. Invoices can show PayID and BSB from the organisation. Display only — not Confirmation of Payee. `POST /api/send-email` emails a sent quote or live invoice. `POST /api/accounting-write` posts to Xero or MYOB. `POST /api/quote-share` mints or rotates the token. `POST /api/queue-run` queues due recurring invoices. OpenAPI is at `/openapi.yaml`. Export JSON or CSV of the books. A BAS Check-shaped CSV is sales lines only (not a GST risk checker, not a bulk ABR lookup, not a BAS).
6. Optional: paste a note or attach a JPEG/PNG/WebP to propose quote lines. Off until `AI_GATEWAY_API_KEY`. The file is not stored. Not a chatbot. Optional email send. Off until `RESEND_API_KEY` and `EMAIL_FROM`. Optional card pay. Off until `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Optional Xero/MYOB write. Off until `XERO_ACCESS_TOKEN` and `XERO_TENANT_ID`, or `MYOB_ACCESS_TOKEN`, `MYOB_CLIENT_ID`, and `MYOB_CF_URI`. Optional first-party sign-in maps a user to one organisation. Off until `AUTH_SECRET` (32+ characters). `ADMIN_EMAIL` is unlimited. New trials from the same network are locked for 24 hours. Optional Redis/BullMQ due-invoice queue. Off until `REDIS_URL`. Leave those keys unset on a public no-login deploy.

## Run locally

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

`npm run dev` uses Webpack on this Windows volume because Turbopack has failed to junction `pg` here. Vercel/CI Linux still uses the default `next build`.

Schema lives in `src/db/schema.ts`. `npm run db:generate` writes drizzle-kit SQL and `drizzle/meta/_journal.json`. `npm run db:apply` applies that journal (same migrator as `drizzle-kit migrate`). `npm run db:check` fails if schema and journal diverge. Empty Postgres (CI, new Docker volume) runs the SQL. A local database that already has tables from the old apply script is recorded on the journal once, then later generates apply as diffs.

Open [http://localhost:3000](http://localhost:3000). Without sign-in, click **Load demo** (safe to click again — it resets the demo data). With `AUTH_SECRET` set, **Fill sample books** copies that ledger onto the signed-in account only. `npm run test:e2e` needs Postgres (same as Load demo). Locally it reuses `npm run dev` on port 3000 if that server is already up. GitHub Actions runs it against `npm run start` after `npm run build`.

Postgres is on host port **5433** so it can sit beside other local databases on 5432.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4
- Drizzle ORM + drizzle-kit migrations + PostgreSQL 18
- Vitest on ABN, GST rounding, tax-code flags, seed shape, ABR JSONP lookup (injected fetch), payment-webhook parse, Resend email compose (injected fetch), Stripe Checkout compose (injected fetch), Xero/MYOB write compose (injected fetch), quote share-token parse, inspection field parse, auth secret / trial / tenant-path parse, Redis URL / BullMQ job parse, and GST quarter parse
- Playwright Chromium on the recruiter path (no login, Load demo, GST on the document, job → quote → invoice → record payment)
- GitHub Actions: drizzle-kit check, apply migrations, seed, test, lint, build, Playwright

## HTTP API

OpenAPI 3.1: [http://localhost:3000/openapi.yaml](http://localhost:3000/openapi.yaml) once the app is running.

`POST /api/payment-webhook` with JSON `{ invoiceId, amountCents, paidOn, method }` records a payment (cash / transfer / card). Same remaining-due maths as the form, including credits and retention held. Not a live card charge. Not Confirmation of Payee.

`POST /api/stripe-checkout` with JSON `{ invoiceId }` starts a Stripe Checkout Session for the amount due now (AUD). Off until `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Leave those unset on a public no-login deploy.

`POST /api/stripe-webhook` is the Stripe endpoint. It verifies `Stripe-Signature` and records `checkout.session.completed` as a card payment. A retry when amount due now is already zero is received but not applied again.

`POST /api/send-email` with JSON `{ kind: "quote"|"invoice", id }` emails the document to the customer address via Resend. Off until `RESEND_API_KEY` and `EMAIL_FROM`. Not a mailbox.

`POST /api/accounting-write` with JSON `{ provider: "xero"|"myob", kind: "invoice"|"credit", id }` posts a live invoice (full lines, not amount due now) to Xero or MYOB. Credit notes go to Xero only. Off until Xero or MYOB tokens are set. Not OAuth. Not a BAS.

`POST /api/quote-share` with JSON `{ quoteId, rotate? }` mints or rotates a share token for a sent quote. Open `GET /q/{token}`. Drafts are not shared. Not a customer portal.

`POST /api/queue-run` with JSON `{}` or `{ kind: "sweep" }` enqueues due recurring invoices on Redis with BullMQ, then issues one period each. Off until `REDIS_URL`. Local docker maps Redis to host port **6380**. Run `npm run queue:worker` for the long-lived worker. Leave `REDIS_URL` unset on a public no-login deploy. Not a booking calendar.

`GET /api/export?format=json|csv|bas-check` downloads the books.

## ABN method

[ABR Format of the ABN](https://abr.business.gov.au/Help/AbnFormat): subtract 1 from the first digit, weight `10,1,3,5,7,9,11,13,15,17,19`, sum modulus 89 must be 0. Worked example `51 824 753 556`.

## Out of scope for v1

Scheduling, GPS, staff roster, customer portal, inventory, native app, Xero OAuth, Hubdoc, BAS lodgement. First-party sign-in is optional and off on the public recruiter demo.
