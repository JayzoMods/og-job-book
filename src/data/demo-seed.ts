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
  jobClaims: "a0000000-0000-4000-8000-000000000015",
  jobDuplicate: "a0000000-0000-4000-8000-000000000016",
  customerEnquiry: "a0000000-0000-4000-8000-000000000081",
  customerQuoted: "a0000000-0000-4000-8000-000000000082",
  customerPaid: "a0000000-0000-4000-8000-000000000083",
  customerInvoiced: "a0000000-0000-4000-8000-000000000084",
  customerClaims: "a0000000-0000-4000-8000-000000000085",
  quoteMixed: "a0000000-0000-4000-8000-000000000021",
  quoteAccepted: "a0000000-0000-4000-8000-000000000022",
  quoteDraft: "a0000000-0000-4000-8000-000000000023",
  quoteUnpaid: "a0000000-0000-4000-8000-000000000024",
  quoteClaims: "a0000000-0000-4000-8000-000000000025",
  quoteRevision: "a0000000-0000-4000-8000-000000000026",
  quoteMixedShare: "q0001ShareDemoHarbourlineInspections00001xx",
  quoteAcceptedShare: "q0002ShareDemoHarbourlineInspections00001xx",
  quoteUnpaidShare: "q0004ShareDemoHarbourlineInspections00001xx",
  quoteClaimsShare: "q0005ShareDemoHarbourlineInspections00001xx",
  quoteLineGst: "a0000000-0000-4000-8000-000000000031",
  quoteLineFree: "a0000000-0000-4000-8000-000000000032",
  quoteLinePaid: "a0000000-0000-4000-8000-000000000033",
  quoteLineDraft: "a0000000-0000-4000-8000-000000000034",
  quoteLineDraftM2: "a0000000-0000-4000-8000-000000000036",
  quoteLineUnpaid: "a0000000-0000-4000-8000-000000000035",
  quoteLineClaims: "a0000000-0000-4000-8000-000000000037",
  quoteLineRevisionGst: "a0000000-0000-4000-8000-000000000038",
  quoteLineRevisionFree: "a0000000-0000-4000-8000-000000000039",
  invoice: "a0000000-0000-4000-8000-000000000041",
  invoiceUnpaid: "a0000000-0000-4000-8000-000000000042",
  invoiceDeposit: "a0000000-0000-4000-8000-000000000043",
  invoiceVariation: "a0000000-0000-4000-8000-000000000044",
  invoiceLine: "a0000000-0000-4000-8000-000000000051",
  invoiceLineUnpaid: "a0000000-0000-4000-8000-000000000052",
  invoiceLineDeposit: "a0000000-0000-4000-8000-000000000053",
  invoiceLineVariation: "a0000000-0000-4000-8000-000000000054",
  payment: "a0000000-0000-4000-8000-000000000061",
  paymentDeposit: "a0000000-0000-4000-8000-000000000062",
  creditNote: "a0000000-0000-4000-8000-000000000071",
  creditNoteLine: "a0000000-0000-4000-8000-000000000072",
  ratePrePurchase: "a0000000-0000-4000-8000-000000000091",
  rateBooklet: "a0000000-0000-4000-8000-000000000092",
  rateStormHours: "a0000000-0000-4000-8000-000000000093",
  rateRoofM2: "a0000000-0000-4000-8000-000000000094",
  recurringAnnual: "a0000000-0000-4000-8000-000000000101",
  recurringAnnualLine: "a0000000-0000-4000-8000-000000000102",
} as const;

export type DemoLine = {
  id: string;
  description: string;
  quantity: number;
  unit: LineUnit;
  unitPriceCents: number;
  unitCostCents?: number | null;
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
    retentionPercent: number;
    nextQuoteSeq: number;
    nextInvoiceSeq: number;
    nextCreditSeq: number;
  };
  customers: Array<{
    id: string;
    name: string;
    suburb: string;
    phone: string;
    email: string;
  }>;
  jobs: Array<{
    id: string;
    customerId: string;
    description: string;
    notes: string;
    propertyAddress: string;
    vendorName: string;
    purchaserName: string;
    reportType: string;
    status: JobStatus;
    duplicatedFromJobId?: string | null;
  }>;
  quotes: Array<{
    id: string;
    jobId: string;
    docNumber: string;
    status: QuoteStatus;
    validUntil: string;
    revisedFromQuoteId?: string | null;
    shareToken?: string | null;
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
    kind: "standard" | "deposit" | "progress" | "variation" | "retention";
    claimPercent: number | null;
    retentionPercent: number;
    retentionHeldCents: number;
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
  rateCard: Array<{
    id: string;
    description: string;
    unit: LineUnit;
    unitPriceCents: number;
    unitCostCents: number | null;
    taxCode: TaxCode;
    amountKind: AmountKind;
    sortOrder: number;
  }>;
  recurringInvoices: Array<{
    id: string;
    jobId: string;
    frequency: "weekly" | "monthly" | "quarterly" | "yearly";
    nextIssueOn: string;
    endOn: string | null;
    status: "active" | "paused";
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
    retentionPercent: 5,
    nextQuoteSeq: 6,
    nextInvoiceSeq: 4,
    nextCreditSeq: 1,
  },
  customers: [
    {
      id: DEMO_IDS.customerEnquiry,
      name: "Samira Chen",
      suburb: "Marrickville",
      phone: "0412 000 111",
      email: "",
    },
    {
      id: DEMO_IDS.customerQuoted,
      name: "Tom Nguyen",
      suburb: "Randwick",
      phone: "0412 000 222",
      email: "tom.nguyen@example.com",
    },
    {
      id: DEMO_IDS.customerPaid,
      name: "Priya Shah",
      suburb: "Leichhardt",
      phone: "",
      email: "priya.shah@example.com",
    },
    {
      id: DEMO_IDS.customerInvoiced,
      name: "Alex Moretti",
      suburb: "Balmain",
      phone: "02 0000 0000",
      email: "alex.moretti@example.com",
    },
    {
      id: DEMO_IDS.customerClaims,
      name: "Jordan Walsh",
      suburb: "Glebe",
      phone: "0412 000 333",
      email: "",
    },
  ],
  jobs: [
    {
      id: DEMO_IDS.jobEnquiry,
      customerId: DEMO_IDS.customerEnquiry,
      description: "Roof leak after storms — inspection only",
      notes: "Called after the storm. Inspection only — no quote yet.",
      propertyAddress: "22 Illawarra Road, Marrickville NSW 2204",
      vendorName: "",
      purchaserName: "Samira Chen",
      reportType: "roof",
      status: "enquiry",
    },
    {
      id: DEMO_IDS.jobQuoted,
      customerId: DEMO_IDS.customerQuoted,
      description: "Pre-purchase inspection, 3-bed terrace",
      notes: "Quote Q-0001 sent. Access via side gate.",
      propertyAddress: "18 Blenheim Street, Randwick NSW 2031",
      vendorName: "Harper Ellis",
      purchaserName: "Tom Nguyen",
      reportType: "pre_purchase",
      status: "quoted",
    },
    {
      id: DEMO_IDS.jobPaid,
      customerId: DEMO_IDS.customerPaid,
      description: "Annual safety inspection",
      notes: "",
      propertyAddress: "7 Flood Street, Leichhardt NSW 2040",
      vendorName: "",
      purchaserName: "",
      reportType: "safety",
      status: "paid",
    },
    {
      id: DEMO_IDS.jobInvoiced,
      customerId: DEMO_IDS.customerInvoiced,
      description: "Pest inspection before settlement",
      notes: "Settlement next month. CN-0001 issued for the extra travel line.",
      propertyAddress: "42 Darling Street, Balmain NSW 2041",
      vendorName: "Kim Ortega",
      purchaserName: "Alex Moretti",
      reportType: "pest",
      status: "invoiced",
    },
    {
      id: DEMO_IDS.jobClaims,
      customerId: DEMO_IDS.customerClaims,
      description: "Storm rectification — roof sheets and flashing",
      notes: "Retention 5%. Deposit paid 18 Aug.",
      propertyAddress: "9 St Johns Road, Glebe NSW 2037",
      vendorName: "",
      purchaserName: "Jordan Walsh",
      reportType: "storm",
      status: "invoiced",
    },
    {
      id: DEMO_IDS.jobDuplicate,
      customerId: DEMO_IDS.customerEnquiry,
      description: "Roof leak after storms — inspection only",
      notes: "Called after the storm. Inspection only — no quote yet.",
      propertyAddress: "22 Illawarra Road, Marrickville NSW 2204",
      vendorName: "",
      purchaserName: "Samira Chen",
      reportType: "roof",
      status: "enquiry",
      duplicatedFromJobId: DEMO_IDS.jobEnquiry,
    },
  ],
  quotes: [
    {
      id: DEMO_IDS.quoteMixed,
      jobId: DEMO_IDS.jobQuoted,
      docNumber: "Q-0001",
      status: "sent",
      validUntil: "2026-09-01",
      shareToken: DEMO_IDS.quoteMixedShare,
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
      shareToken: DEMO_IDS.quoteAcceptedShare,
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
          unitCostCents: 8800,
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
      shareToken: DEMO_IDS.quoteUnpaidShare,
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
    {
      id: DEMO_IDS.quoteClaims,
      jobId: DEMO_IDS.jobClaims,
      docNumber: "Q-0005",
      status: "accepted",
      validUntil: "2026-10-15",
      shareToken: DEMO_IDS.quoteClaimsShare,
      lines: [
        {
          id: DEMO_IDS.quoteLineClaims,
          description: "Storm rectification — roof sheets and flashing",
          quantity: 1,
          unit: "each",
          unitPriceCents: 220000,
          taxCode: "GST",
          amountKind: "inclusive",
          sortOrder: 0,
        },
      ],
    },
    {
      id: DEMO_IDS.quoteRevision,
      jobId: DEMO_IDS.jobQuoted,
      docNumber: "Q-0006",
      status: "draft",
      validUntil: "2026-10-09",
      revisedFromQuoteId: DEMO_IDS.quoteMixed,
      lines: [
        {
          id: DEMO_IDS.quoteLineRevisionGst,
          description: "Pre-purchase building inspection",
          quantity: 1,
          unit: "each",
          unitPriceCents: 121000,
          taxCode: "GST",
          amountKind: "inclusive",
          sortOrder: 0,
        },
        {
          id: DEMO_IDS.quoteLineRevisionFree,
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
      kind: "standard",
      claimPercent: null,
      retentionPercent: 0,
      retentionHeldCents: 0,
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
      kind: "standard",
      claimPercent: null,
      retentionPercent: 0,
      retentionHeldCents: 0,
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
    {
      id: DEMO_IDS.invoiceDeposit,
      jobId: DEMO_IDS.jobClaims,
      quoteId: DEMO_IDS.quoteClaims,
      docNumber: "INV-0003",
      status: "paid",
      dueDate: "2026-08-26",
      paymentTermsDays: 14,
      kind: "deposit",
      claimPercent: 20,
      retentionPercent: 5,
      retentionHeldCents: 2200,
      lines: [
        {
          id: DEMO_IDS.invoiceLineDeposit,
          description: "Deposit 20% of Q-0005",
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
      id: DEMO_IDS.invoiceVariation,
      jobId: DEMO_IDS.jobClaims,
      quoteId: DEMO_IDS.quoteClaims,
      docNumber: "INV-0004",
      status: "sent",
      dueDate: "2026-09-23",
      paymentTermsDays: 14,
      kind: "variation",
      claimPercent: null,
      retentionPercent: 5,
      retentionHeldCents: 1650,
      lines: [
        {
          id: DEMO_IDS.invoiceLineVariation,
          description: "Extra flashing at south parapet",
          quantity: 1,
          unit: "each",
          unitPriceCents: 33000,
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
    {
      id: DEMO_IDS.paymentDeposit,
      invoiceId: DEMO_IDS.invoiceDeposit,
      amountCents: 41800,
      paidOn: "2026-08-18",
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
  rateCard: [
    {
      id: DEMO_IDS.ratePrePurchase,
      description: "Pre-purchase building inspection",
      unit: "each",
      unitPriceCents: 121000,
      unitCostCents: 88000,
      taxCode: "GST",
      amountKind: "inclusive",
      sortOrder: 0,
    },
    {
      id: DEMO_IDS.rateBooklet,
      description: "GST-free first-aid training booklet",
      unit: "each",
      unitPriceCents: 2200,
      unitCostCents: 1000,
      taxCode: "GST_FREE",
      amountKind: "inclusive",
      sortOrder: 1,
    },
    {
      id: DEMO_IDS.rateStormHours,
      description: "Storm inspection",
      unit: "hours",
      unitPriceCents: 13200,
      unitCostCents: 8800,
      taxCode: "GST",
      amountKind: "inclusive",
      sortOrder: 2,
    },
    {
      id: DEMO_IDS.rateRoofM2,
      description: "Roof area note (measure)",
      unit: "m2",
      unitPriceCents: 1100,
      unitCostCents: null,
      taxCode: "GST",
      amountKind: "inclusive",
      sortOrder: 3,
    },
  ],
  recurringInvoices: [
    {
      id: DEMO_IDS.recurringAnnual,
      jobId: DEMO_IDS.jobPaid,
      frequency: "yearly",
      nextIssueOn: "2026-09-01",
      endOn: null,
      status: "active",
      lines: [
        {
          id: DEMO_IDS.recurringAnnualLine,
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
  ],
};
