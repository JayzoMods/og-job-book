# OG Job Book

Job → quote → invoice → record payment, with Australian ABN checksum and GST totals on the documents. Public portfolio web app for [Jayden O'Grady](https://ogdigitaldesigns.com.au) / OG Digital Designs.

**Live demo (no login):** not deployed yet. Run locally and click **Load demo**.

This is **not** ServiceM8, not a BAS agent, not tax advice, and it does not lodge with the ATO.

## What it does

1. Load a seeded fictional Sydney inspection org (or create jobs yourself).
2. Add line items on a quote: quantity, unit (each, hours, or m²), unit price, tax code (`GST` | `GST_FREE` | `BAS_EXCLUDED` | `INPUT_TAXED`). Jobs belong to a customer (name, suburb, optional phone and email). Job notes are internal and are not printed. This app does not call, SMS, or send email. Duplicate job copies the customer, description, and notes onto a new enquiry. Revise quote copies a sent quote into a new numbered draft. An organisation rate card holds sell prices you can drop onto a quote (qty 1). Optional cost on a rate or quote line shows markup as (sell − cost) ÷ cost. Cost is not printed.
3. Documents show GST, GST-free, and total. Inclusive GST is 1/11 (nearest cent). Exclusive is 10%. Each GST line shows that proof. If the org is not GST registered, GST is not charged. Quotes are numbered `Q-0001`, invoices `INV-0001`, credit notes `CN-0001`. Quotes have a valid-until date. Invoices use the org payment terms (due on receipt, 7, 14, 30, or 60 days) and flag overdue when unpaid past the due date. A credit note reduces the amount owing on an invoice (same GST line model). It is not a refund and does not lodge a BAS. Deposits and progress claims bill a percent of an accepted quote as one GST-inclusive line. Variations are extra lines. Retention is a hold, not a GST adjustment. Print a customer statement of account (not a tax invoice) and a remittance advice for a recorded payment (not Confirmation of Payee).
4. ABN on the quote/invoice uses the ABR modulus-89 checksum. Invalid checksums are flagged in plain English. Optional live ABR lookup of the organisation ABN (entity name and GST date) when `ABR_GUID` is set. One ABN, not a bulk list. Checksum still runs when the GUID is unset.
5. Accept a quote, issue an invoice, record a payment (cash / transfer / card — status only, not Stripe). After an accepted quote you can also issue a deposit, progress claim, variation, or retention release. Retention is a hold of billed amounts, stamped on the invoice. Recurring invoices are line templates on a job (weekly, monthly, quarterly, or yearly). Issue is a click — not a calendar, not email. They do not reduce quote remaining and do not hold retention. Invoices can show PayID and BSB from the organisation. Display only — not Confirmation of Payee. `POST /api/payment-webhook` records a payment (same rules as the form). OpenAPI is at `/openapi.yaml`. Export JSON or CSV of the books. A BAS Check-shaped CSV is sales lines only (not a GST risk checker, not a bulk ABR lookup, not a BAS).
6. Optional: paste a note or attach a JPEG/PNG/WebP to propose quote lines. Off until `AI_GATEWAY_API_KEY`. The file is not stored. Not a chatbot. Leave that key unset on a public no-login deploy.

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

Open [http://localhost:3000](http://localhost:3000). Click **Load demo** (safe to click again — it resets the demo data). `npm run test:e2e` needs Postgres (same as Load demo). Locally it reuses `npm run dev` on port 3000 if that server is already up. GitHub Actions runs it against `npm run start` after `npm run build`.

Postgres is on host port **5433** so it can sit beside other local databases on 5432.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4
- Drizzle ORM + drizzle-kit migrations + PostgreSQL 18
- Vitest on ABN, GST rounding, tax-code flags, seed shape, ABR JSONP lookup (injected fetch), and payment-webhook parse
- Playwright Chromium on the recruiter path (no login, Load demo, GST on the document, job → quote → invoice → record payment)
- GitHub Actions: drizzle-kit check, apply migrations, seed, test, lint, build, Playwright

## HTTP API

OpenAPI 3.1: [http://localhost:3000/openapi.yaml](http://localhost:3000/openapi.yaml) once the app is running.

`POST /api/payment-webhook` with JSON `{ invoiceId, amountCents, paidOn, method }` records a payment (cash / transfer / card). Same remaining-due maths as the form, including credits and retention held. Not Stripe. Not Confirmation of Payee.

`GET /api/export?format=json|csv|bas-check` downloads the books.

## ABN method

[ABR Format of the ABN](https://abr.business.gov.au/Help/AbnFormat): subtract 1 from the first digit, weight `10,1,3,5,7,9,11,13,15,17,19`, sum modulus 89 must be 0. Worked example `51 824 753 556`.

## Out of scope for v1

Scheduling, GPS, staff roster, customer portal, inventory, native app, Xero, Hubdoc, live Stripe charges, email sending, BAS lodgement.
