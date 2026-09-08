import type {
  AmountKind,
  JobStatus,
  LineUnit,
  PaymentMethod,
  QuoteStatus,
  TaxCode,
} from "@/lib/ledger/tax";

export const DEMO_IDS = {
  org: "a0000000-0000-4000-8000-000000000001",
  jobEnquiry: "a0000000-0000-4000-8000-000000000011",
  jobQuoted: "a0000000-0000-4000-8000-000000000012",
  jobPaid: "a0000000-0000-4000-8000-000000000013",
  jobInvoiced: "a0000000-0000-4000-8000-000000000014",
  quoteMixed: "a0000000-0000-4000-8000-000000000021",
  quoteAccepted: "a0000000-0000-4000-8000-000000000022",
  quoteDraft: "a0000000-0000-4000-8000-000000000023",
  quoteUnpaid: "a0000000-0000-4000-8000-000000000024",
  quoteLineGst: "a0000000-0000-4000-8000-000000000031",
  quoteLineFree: "a0000000-0000-4000-8000-000000000032",
  quoteLinePaid: "a0000000-0000-4000-8000-000000000033",
  quoteLineDraft: "a0000000-0000-4000-8000-000000000034",
  quoteLineDraftM2: "a0000000-0000-4000-8000-000000000036",
  quoteLineUnpaid: "a0000000-0000-4000-8000-000000000035",
  invoice: "a0000000-0000-4000-8000-000000000041",
  invoiceUnpaid: "a0000000-0000-4000-8000-000000000042",
  invoiceLine: "a0000000-0000-4000-8000-000000000051",
  invoiceLineUnpaid: "a0000000-0000-4000-8000-000000000052",
  payment: "a0000000-0000-4000-8000-000000000061",
  creditNote: "a0000000-0000-4000-8000-000000000071",
  creditNoteLine: "a0000000-0000-4000-8000-000000000072",
} as const;

export type DemoLine = {
  id: string;
  description: string;
  quantity: number;
  unit: LineUnit;
  unitPriceCents: number;
  taxCode: TaxCode;
  amountKind: AmountKind;
  sortOrder: number;
};

export type DemoSeed = {
  org: {
    id: string;
    name: string;
    abn: string;
    gstRegistered: boolean;
    address: string;
    paymentTermsDays: number;
    accountName: string;
    bsb: string;
    accountNumber: string;
    payId: string;
    nextQuoteSeq: number;
    nextInvoiceSeq: number;
    nextCreditSeq: number;
  };
  jobs: Array<{
    id: string;
    customerName: string;
    suburb: string;
    description: string;
    status: JobStatus;
  }>;
  quotes: Array<{
    id: string;
    jobId: string;
    docNumber: string;
    status: QuoteStatus;
    validUntil: string;
    lines: DemoLine[];
  }>;
  invoices: Array<{
    id: string;
    jobId: string;
    quoteId: string;
    docNumber: string;
    status: "draft" | "sent" | "paid" | "void";
    dueDate: string;
    paymentTermsDays: number;
    lines: DemoLine[];
  }>;
  payments: Array<{
    id: string;
    invoiceId: string;
    amountCents: number;
    paidOn: string;
    method: PaymentMethod;
  }>;
  creditNotes: Array<{
    id: string;
    invoiceId: string;
    jobId: string;
    docNumber: string;
    status: "issued" | "void";
    reason: string;
    lines: DemoLine[];
  }>;
};

/** Fictional AU inspection business. Not a real client. ABN is the ABR checksum example. */
export const demoSeed: DemoSeed = {
  org: {
    id: DEMO_IDS.org,
    name: "Harbourline Inspections Pty Ltd",
    abn: "51824753556",
    gstRegistered: true,
    address: "14 Pier Street, Pyrmont NSW 2009",
    paymentTermsDays: 14,
    accountName: "Harbourline Inspections Pty Ltd",
    bsb: "000000",
    accountNumber: "00012345",
    payId: "harbourline@example.com",
    nextQuoteSeq: 4,
    nextInvoiceSeq: 2,
    nextCreditSeq: 1,
  },
  jobs: [
    {
      id: DEMO_IDS.jobEnquiry,
      customerName: "Samira Chen",
      suburb: "Marrickville",
      description: "Roof leak after storms — inspection only",
      status: "enquiry",
    },
    {
      id: DEMO_IDS.jobQuoted,
      customerName: "Tom Nguyen",
      suburb: "Randwick",
      description: "Pre-purchase inspection, 3-bed terrace",
      status: "quoted",
    },
    {
      id: DEMO_IDS.jobPaid,
      customerName: "Priya Shah",
      suburb: "Leichhardt",
      description: "Annual safety inspection",
      status: "paid",
    },
    {
      id: DEMO_IDS.jobInvoiced,
      customerName: "Alex Moretti",
      suburb: "Balmain",
      description: "Pest inspection before settlement",
      status: "invoiced",
    },
  ],
  quotes: [
    {
      id: DEMO_IDS.quoteMixed,
      jobId: DEMO_IDS.jobQuoted,
      docNumber: "Q-0001",
      status: "sent",
      validUntil: "2026-09-01",
      lines: [
        {
          id: DEMO_IDS.quoteLineGst,
          description: "Pre-purchase building inspection",
          quantity: 1,
          unit: "each",
          unitPriceCents: 121000,
          taxCode: "GST",
          amountKind: "inclusive",
          sortOrder: 0,
        },
        {
          id: DEMO_IDS.quoteLineFree,
          description: "GST-free first-aid training booklet",
          quantity: 1,
          unit: "each",
          unitPriceCents: 2200,
          taxCode: "GST_FREE",
          amountKind: "inclusive",
          sortOrder: 1,
        },
      ],
    },
    {
      id: DEMO_IDS.quoteAccepted,
      jobId: DEMO_IDS.jobPaid,
      docNumber: "Q-0002",
      status: "accepted",
      validUntil: "2026-08-20",
      lines: [
        {
          id: DEMO_IDS.quoteLinePaid,
          description: "Annual safety inspection",
          quantity: 1,
          unit: "each",
          unitPriceCents: 44000,
          taxCode: "GST",
          amountKind: "inclusive",
          sortOrder: 0,
        },
      ],
    },
    {
      id: DEMO_IDS.quoteDraft,
      jobId: DEMO_IDS.jobEnquiry,
      docNumber: "Q-0003",
      status: "draft",
      validUntil: "2026-10-08",
      lines: [
        {
          id: DEMO_IDS.quoteLineDraft,
          description: "Storm inspection — draft only",
          quantity: 2.5,
          unit: "hours",
          unitPriceCents: 13200,
          taxCode: "GST",
          amountKind: "inclusive",
          sortOrder: 0,
        },
        {
          id: DEMO_IDS.quoteLineDraftM2,
          description: "Roof area note (measure)",
          quantity: 12,
          unit: "m2",
          unitPriceCents: 1100,
          taxCode: "GST",
          amountKind: "inclusive",
          sortOrder: 1,
        },
      ],
    },
    {
      id: DEMO_IDS.quoteUnpaid,
      jobId: DEMO_IDS.jobInvoiced,
      docNumber: "Q-0004",
      status: "accepted",
      validUntil: "2026-09-15",
      lines: [
        {
          id: DEMO_IDS.quoteLineUnpaid,
          description: "Pest inspection before settlement",
          quantity: 1,
          unit: "each",
          unitPriceCents: 55000,
          taxCode: "GST",
          amountKind: "inclusive",
          sortOrder: 0,
        },
      ],
    },
  ],
  invoices: [
    {
      id: DEMO_IDS.invoice,
      jobId: DEMO_IDS.jobPaid,
      quoteId: DEMO_IDS.quoteAccepted,
      docNumber: "INV-0001",
      status: "paid",
      dueDate: "2026-08-15",
      paymentTermsDays: 14,
      lines: [
        {
          id: DEMO_IDS.invoiceLine,
          description: "Annual safety inspection",
          quantity: 1,
          unit: "each",
          unitPriceCents: 44000,
          taxCode: "GST",
          amountKind: "inclusive",
          sortOrder: 0,
        },
      ],
    },
    {
      id: DEMO_IDS.invoiceUnpaid,
      jobId: DEMO_IDS.jobInvoiced,
      quoteId: DEMO_IDS.quoteUnpaid,
      docNumber: "INV-0002",
      status: "sent",
      dueDate: "2026-09-01",
      paymentTermsDays: 14,
      lines: [
        {
          id: DEMO_IDS.invoiceLineUnpaid,
          description: "Pest inspection before settlement",
          quantity: 1,
          unit: "each",
          unitPriceCents: 55000,
          taxCode: "GST",
          amountKind: "inclusive",
          sortOrder: 0,
        },
      ],
    },
  ],
  payments: [
    {
      id: DEMO_IDS.payment,
      invoiceId: DEMO_IDS.invoice,
      amountCents: 44000,
      paidOn: "2026-08-10",
      method: "transfer",
    },
  ],
  creditNotes: [
    {
      id: DEMO_IDS.creditNote,
      invoiceId: DEMO_IDS.invoiceUnpaid,
      jobId: DEMO_IDS.jobInvoiced,
      docNumber: "CN-0001",
      status: "issued",
      reason: "Access delay discount",
      lines: [
        {
          id: DEMO_IDS.creditNoteLine,
          description: "Access delay discount",
          quantity: 1,
          unit: "each",
          unitPriceCents: 11000,
          taxCode: "GST",
          amountKind: "inclusive",
          sortOrder: 0,
        },
      ],
    },
  ],
};
