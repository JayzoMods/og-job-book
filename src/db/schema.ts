import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
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

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  suburb: text("suburb").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),
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
