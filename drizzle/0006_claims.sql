-- Stage 10: deposits, progress claims, variations, retention. Safe on a fresh 0000_init (IF NOT EXISTS).

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS retention_percent integer NOT NULL DEFAULT 0;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'standard';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS claim_percent integer;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retention_percent integer NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retention_held_cents integer NOT NULL DEFAULT 0;
