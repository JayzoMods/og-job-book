import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const orgs = pgTable("orgs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  abn: text("abn").notNull(),
  gstRegistered: boolean("gst_registered").notNull(),
  address: text("address").notNull(),
  paymentTermsDays: integer("payment_terms_days").notNull().default(14),
  accountName: text("account_name").notNull().default(""),
  bsb: text("bsb").notNull().default(""),
  accountNumber: text("account_number").notNull().default(""),
  payId: text("payid").notNull().default(""),
  retentionPercent: integer("retention_percent").notNull().default(0),
  nextQuoteSeq: integer("next_quote_seq").notNull().default(0),
  nextInvoiceSeq: integer("next_invoice_seq").notNull().default(0),
  nextCreditSeq: integer("next_credit_seq").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    suburb: text("suburb").notNull(),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("customers_org_id_name_suburb_key").on(
      table.orgId,
      table.name,
      table.suburb,
    ),
  ],
);

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  description: text("description").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull(),
  duplicatedFromJobId: uuid("duplicated_from_job_id").references(
    (): AnyPgColumn => jobs.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const quotes = pgTable("quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  docNumber: text("doc_number").notNull(),
  status: text("status").notNull(),
  validUntil: date("valid_until", { mode: "string" }).notNull(),
  revisedFromQuoteId: uuid("revised_from_quote_id").references(
    (): AnyPgColumn => quotes.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const quoteLines = pgTable("quote_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" }).notNull(),
  unit: text("unit").notNull().default("each"),
  unitPriceCents: integer("unit_price_cents").notNull(),
  unitCostCents: integer("unit_cost_cents"),
  taxCode: text("tax_code").notNull(),
  amountKind: text("amount_kind").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const recurringInvoices = pgTable("recurring_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  frequency: text("frequency").notNull(),
  nextIssueOn: date("next_issue_on", { mode: "string" }).notNull(),
  endOn: date("end_on", { mode: "string" }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const recurringInvoiceLines = pgTable("recurring_invoice_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  recurringInvoiceId: uuid("recurring_invoice_id")
    .notNull()
    .references(() => recurringInvoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" }).notNull(),
  unit: text("unit").notNull().default("each"),
  unitPriceCents: integer("unit_price_cents").notNull(),
  taxCode: text("tax_code").notNull(),
  amountKind: text("amount_kind").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
  recurringInvoiceId: uuid("recurring_invoice_id").references(
    () => recurringInvoices.id,
    { onDelete: "set null" },
  ),
  docNumber: text("doc_number").notNull(),
  status: text("status").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  paymentTermsDays: integer("payment_terms_days").notNull().default(14),
  kind: text("kind").notNull().default("standard"),
  claimPercent: integer("claim_percent"),
  retentionPercent: integer("retention_percent").notNull().default(0),
  retentionHeldCents: integer("retention_held_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" }).notNull(),
  unit: text("unit").notNull().default("each"),
  unitPriceCents: integer("unit_price_cents").notNull(),
  taxCode: text("tax_code").notNull(),
  amountKind: text("amount_kind").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const creditNotes = pgTable("credit_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  docNumber: text("doc_number").notNull(),
  status: text("status").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const creditNoteLines = pgTable("credit_note_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  creditNoteId: uuid("credit_note_id")
    .notNull()
    .references(() => creditNotes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" }).notNull(),
  unit: text("unit").notNull().default("each"),
  unitPriceCents: integer("unit_price_cents").notNull(),
  taxCode: text("tax_code").notNull(),
  amountKind: text("amount_kind").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  paidOn: date("paid_on", { mode: "string" }).notNull(),
  method: text("method").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const rateCardItems = pgTable(
  "rate_card_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    unit: text("unit").notNull().default("each"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    unitCostCents: integer("unit_cost_cents"),
    taxCode: text("tax_code").notNull(),
    amountKind: text("amount_kind").notNull().default("inclusive"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("rate_card_items_org_id_description_unit_key").on(
      table.orgId,
      table.description,
      table.unit,
    ),
  ],
);
