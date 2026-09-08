-- AU Job Book v1 schema. Apply with: npm run db:apply

CREATE TABLE IF NOT EXISTS orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  abn text NOT NULL,
  gst_registered boolean NOT NULL,
  address text NOT NULL,
  payment_terms_days integer NOT NULL DEFAULT 14,
  account_name text NOT NULL DEFAULT '',
  bsb text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  payid text NOT NULL DEFAULT '',
  next_quote_seq integer NOT NULL DEFAULT 0,
  next_invoice_seq integer NOT NULL DEFAULT 0,
  next_credit_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs (id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  suburb text NOT NULL,
  description text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  status text NOT NULL,
  valid_until date NOT NULL DEFAULT (CURRENT_DATE + 30),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes (id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12, 3) NOT NULL,
  unit text NOT NULL DEFAULT 'each',
  unit_price_cents integer NOT NULL,
  tax_code text NOT NULL,
  amount_kind text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes (id) ON DELETE SET NULL,
  doc_number text NOT NULL,
  status text NOT NULL,
  due_date date NOT NULL,
  payment_terms_days integer NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12, 3) NOT NULL,
  unit text NOT NULL DEFAULT 'each',
  unit_price_cents integer NOT NULL,
  tax_code text NOT NULL,
  amount_kind text NOT NULL,
  sort_order integer NOT NULL
);

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

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  paid_on date NOT NULL,
  method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
