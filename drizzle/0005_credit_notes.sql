-- Stage 9: credit notes against invoices. Safe on a fresh 0000_init (IF NOT EXISTS).

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS next_credit_seq integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  status text NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES credit_notes (id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12, 3) NOT NULL,
  unit text NOT NULL DEFAULT 'each',
  unit_price_cents integer NOT NULL,
  tax_code text NOT NULL,
  amount_kind text NOT NULL,
  sort_order integer NOT NULL
);
