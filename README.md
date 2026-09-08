# AU Job Book

Job → quote → invoice → record payment, with Australian ABN checksum and GST totals on the documents. Public portfolio web app for [Jayden O'Grady](https://ogdigitaldesigns.com.au) / OG Digital Designs.

**Live demo (no login):** not deployed yet. Run locally and click **Load demo**.

This is **not** ServiceM8, not a BAS agent, not tax advice, and it does not lodge with the ATO.

## What it does

1. Load a seeded fictional Sydney inspection org (or create jobs yourself).
2. Add line items on a quote: quantity, unit (each, hours, or m²), unit price, tax code (`GST` | `GST_FREE` | `BAS_EXCLUDED` | `INPUT_TAXED`).
3. Documents show GST, GST-free, and total. Inclusive GST is 1/11 (nearest cent). Exclusive is 10%. Each GST line shows that proof. If the org is not GST registered, GST is not charged. Quotes are numbered `Q-0001`, invoices `INV-0001`, credit notes `CN-0001`. Quotes have a valid-until date. Invoices use the org payment terms (due on receipt, 7, 14, 30, or 60 days) and flag overdue when unpaid past the due date. A credit note reduces the amount owing on an invoice (same GST line model). It is not a refund and does not lodge a BAS.
4. ABN on the quote/invoice uses the ABR modulus-89 checksum. Invalid checksums are flagged in plain English. Optional live ABR lookup of the organisation ABN (entity name and GST date) when `ABR_GUID` is set. One ABN, not a bulk list. Checksum still runs when the GUID is unset.
5. Accept a quote, issue an invoice, record a payment (cash / transfer / card — status only, not Stripe). Invoices can show PayID and BSB from the organisation. Display only — not Confirmation of Payee. `POST /api/payment-webhook` is a payload-shape stub only.
6. Optional: paste a note or attach a JPEG/PNG/WebP to propose quote lines. Off until `AI_GATEWAY_API_KEY`. The file is not stored. Not a chatbot. Leave that key unset on a public no-login deploy.

## Run locally

```bash
docker compose up -d
cp .env.example .env.local
npm install
npm run db:apply
npm run db:seed
npm test
npm run dev
```

`npm run dev` uses Webpack on this Windows volume because Turbopack has failed to junction `pg` here. Vercel/CI Linux still uses the default `next build`.

Open [http://localhost:3000](http://localhost:3000). Click **Load demo** (safe to click again — it resets the demo data).

Postgres is on host port **5433** so it can sit beside other local databases on 5432.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4
- Drizzle ORM + PostgreSQL 18
- Vitest on ABN, GST rounding, tax-code flags, seed shape, and ABR JSONP lookup (injected fetch)
- GitHub Actions: apply schema, seed, test, lint, build

## ABN method

[ABR Format of the ABN](https://abr.business.gov.au/Help/AbnFormat): subtract 1 from the first digit, weight `10,1,3,5,7,9,11,13,15,17,19`, sum modulus 89 must be 0. Worked example `51 824 753 556`.

## Out of scope for v1

Scheduling, GPS, staff roster, customer portal, inventory, native app, Xero, Hubdoc, live Stripe charges, email sending, BAS lodgement.
