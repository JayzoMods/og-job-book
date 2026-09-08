-- Stage 1: document numbers + seq counters. Safe on a fresh 0000_init (IF NOT EXISTS).

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS next_quote_seq integer NOT NULL DEFAULT 0;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS next_invoice_seq integer NOT NULL DEFAULT 0;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS doc_number text;
UPDATE quotes SET doc_number = 'Q-' || upper(substr(id::text, 1, 8)) WHERE doc_number IS NULL;
ALTER TABLE quotes ALTER COLUMN doc_number SET NOT NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS doc_number text;
UPDATE invoices SET doc_number = 'INV-' || upper(substr(id::text, 1, 8)) WHERE doc_number IS NULL;
ALTER TABLE invoices ALTER COLUMN doc_number SET NOT NULL;
