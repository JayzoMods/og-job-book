-- Stage 8: PayID / BSB on invoices (display only). Safe on a fresh 0000_init (IF NOT EXISTS).

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS account_name text NOT NULL DEFAULT '';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS bsb text NOT NULL DEFAULT '';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS account_number text NOT NULL DEFAULT '';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS payid text NOT NULL DEFAULT '';
