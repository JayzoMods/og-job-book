-- Stage 7: quote expiry, payment terms, overdue. Safe on a fresh 0000_init (IF NOT EXISTS).

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 14;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until date NOT NULL DEFAULT (CURRENT_DATE + 30);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 14;
