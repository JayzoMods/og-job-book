-- Stage 6: line units (each, hours, m²). Safe on a fresh 0000_init (IF NOT EXISTS).

ALTER TABLE quote_lines ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'each';
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'each';
