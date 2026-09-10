import { formatAbn } from "./abn";
import { formatBsb } from "./pay";
import { DEMO_IDS, demoSeed, type DemoSeed } from "../../data/demo-seed";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FormFillTemplate = {
  id: string;
  label: string;
  fields: Record<string, string>;
};

/** Empty, whitespace, and non-UUID org ids are rejected. */
export function parseTemplateOrgId(raw: string | number | null | undefined): string | null {
  const id = String(raw ?? "").trim();
  return UUID_RE.test(id) ? id : null;
}

export function canApplySampleBooks(input: {
  authOn: boolean;
  trialWriteAllowed: boolean;
  jobCount: number;
  customerCount: number;
  rateCount: number;
}): boolean {
  if (!input.authOn || !input.trialWriteAllowed) {
    return false;
  }
  const counts = [input.jobCount, input.customerCount, input.rateCount];
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
    return false;
  }
  return counts.every((count) => count === 0);
}

function remapId(
  sourceId: string,
  ids: Map<string, string>,
  nextId: () => string,
): string | null {
  const existing = ids.get(sourceId);
  if (existing) {
    return existing;
  }
  const next = parseTemplateOrgId(nextId());
  if (!next) {
    return null;
  }
  ids.set(sourceId, next);
  return next;
}

function remapShareToken(
  existing: string | null | undefined,
  nextShareToken: (existing: string) => string,
): { ok: true; token: string | null } | { ok: false } {
  const raw = String(existing ?? "").trim();
  if (raw === "") {
    return { ok: true, token: null };
  }
  const next = String(nextShareToken(raw) ?? "").trim();
  if (next === "" || next === raw) {
    return { ok: false };
  }
  return { ok: true, token: next };
}

/**
 * Copy the Harbourline ledger onto another organisation.
 * New ids and share tokens so a signed-in account cannot collide with Load demo.
 */
export function remapDemoSeed(
  source: DemoSeed,
  input: {
    orgId: string;
    nextId: () => string;
    nextShareToken: (existing: string) => string;
  },
): DemoSeed | null {
  const orgId = parseTemplateOrgId(input.orgId);
  if (!orgId) {
    return null;
  }

  const ids = new Map<string, string>([[source.org.id, orgId]]);
  const mapId = (id: string) => remapId(id, ids, input.nextId);

  const customers: DemoSeed["customers"] = [];
  for (const customer of source.customers) {
    const id = mapId(customer.id);
    if (!id) {
      return null;
    }
    customers.push({ ...customer, id });
  }

  const jobs: DemoSeed["jobs"] = [];
  for (const job of source.jobs) {
    const id = mapId(job.id);
    const customerId = ids.get(job.customerId);
    if (!id || !customerId) {
      return null;
    }
    let duplicatedFromJobId: string | null | undefined = job.duplicatedFromJobId ?? null;
    if (duplicatedFromJobId) {
      duplicatedFromJobId = ids.get(duplicatedFromJobId) ?? mapId(duplicatedFromJobId);
      if (!duplicatedFromJobId) {
        return null;
      }
    }
    jobs.push({ ...job, id, customerId, duplicatedFromJobId });
  }

  const quotes: DemoSeed["quotes"] = [];
  for (const quote of source.quotes) {
    const id = mapId(quote.id);
    const jobId = ids.get(quote.jobId);
    if (!id || !jobId) {
      return null;
    }
    let revisedFromQuoteId: string | null | undefined = quote.revisedFromQuoteId ?? null;
    if (revisedFromQuoteId) {
      revisedFromQuoteId = ids.get(revisedFromQuoteId) ?? mapId(revisedFromQuoteId);
      if (!revisedFromQuoteId) {
        return null;
      }
    }
    const share = remapShareToken(quote.shareToken, input.nextShareToken);
    if (!share.ok) {
      return null;
    }
    const lines = [];
    for (const line of quote.lines) {
      const lineId = mapId(line.id);
      if (!lineId) {
        return null;
      }
      lines.push({ ...line, id: lineId });
    }
    quotes.push({
      ...quote,
      id,
      jobId,
      revisedFromQuoteId,
      shareToken: share.token,
      lines,
    });
  }

  const invoices: DemoSeed["invoices"] = [];
  for (const invoice of source.invoices) {
    const id = mapId(invoice.id);
    const jobId = ids.get(invoice.jobId);
    const quoteId = ids.get(invoice.quoteId);
    if (!id || !jobId || !quoteId) {
      return null;
    }
    const lines = [];
    for (const line of invoice.lines) {
      const lineId = mapId(line.id);
      if (!lineId) {
        return null;
      }
      lines.push({ ...line, id: lineId });
    }
    invoices.push({ ...invoice, id, jobId, quoteId, lines });
  }

  const payments: DemoSeed["payments"] = [];
  for (const payment of source.payments) {
    const id = mapId(payment.id);
    const invoiceId = ids.get(payment.invoiceId);
    if (!id || !invoiceId) {
      return null;
    }
    payments.push({ ...payment, id, invoiceId });
  }

  const creditNotes: DemoSeed["creditNotes"] = [];
  for (const note of source.creditNotes) {
    const id = mapId(note.id);
    const invoiceId = ids.get(note.invoiceId);
    const jobId = ids.get(note.jobId);
    if (!id || !invoiceId || !jobId) {
      return null;
    }
    const lines = [];
    for (const line of note.lines) {
      const lineId = mapId(line.id);
      if (!lineId) {
        return null;
      }
      lines.push({ ...line, id: lineId });
    }
    creditNotes.push({ ...note, id, invoiceId, jobId, lines });
  }

  const rateCard: DemoSeed["rateCard"] = [];
  for (const item of source.rateCard) {
    const id = mapId(item.id);
    if (!id) {
      return null;
    }
    rateCard.push({ ...item, id });
  }

  const recurringInvoices: DemoSeed["recurringInvoices"] = [];
  for (const template of source.recurringInvoices) {
    const id = mapId(template.id);
    const jobId = ids.get(template.jobId);
    if (!id || !jobId) {
      return null;
    }
    const lines = [];
    for (const line of template.lines) {
      const lineId = mapId(line.id);
      if (!lineId) {
        return null;
      }
      lines.push({ ...line, id: lineId });
    }
    recurringInvoices.push({ ...template, id, jobId, lines });
  }

  return {
    org: { ...source.org, id: orgId },
    customers,
    jobs,
    quotes,
    invoices,
    payments,
    creditNotes,
    rateCard,
    recurringInvoices,
  };
}

export const ORG_FORM_TEMPLATES: FormFillTemplate[] = [
  {
    id: "harbourline",
    label: "Inspection org",
    fields: {
      name: demoSeed.org.name,
      abn: formatAbn(demoSeed.org.abn),
      address: demoSeed.org.address,
      gstRegistered: demoSeed.org.gstRegistered ? "yes" : "no",
      paymentTermsDays: String(demoSeed.org.paymentTermsDays),
      retentionPercent: String(demoSeed.org.retentionPercent),
      accountName: demoSeed.org.accountName,
      bsb: formatBsb(demoSeed.org.bsb),
      accountNumber: demoSeed.org.accountNumber,
      payId: demoSeed.org.payId,
    },
  },
  {
    id: "electrical",
    label: "Electrical org",
    fields: {
      name: "Pittwater Spark Pty Ltd",
      abn: formatAbn(demoSeed.org.abn),
      address: "8 Beaconsfield Street, Newport NSW 2106",
      gstRegistered: "yes",
      paymentTermsDays: "14",
      retentionPercent: "0",
      accountName: "Pittwater Spark Pty Ltd",
      bsb: formatBsb("000000"),
      accountNumber: "00054321",
      payId: "pittwater.spark@example.com",
    },
  },
];

const tom = demoSeed.customers.find((customer) => customer.id === DEMO_IDS.customerQuoted);
const samira = demoSeed.customers.find((customer) => customer.id === DEMO_IDS.customerEnquiry);
const priya = demoSeed.customers.find((customer) => customer.id === DEMO_IDS.customerPaid);
const tomJob = demoSeed.jobs.find((job) => job.id === DEMO_IDS.jobQuoted);
const roofJob = demoSeed.jobs.find((job) => job.id === DEMO_IDS.jobEnquiry);
const safetyJob = demoSeed.jobs.find((job) => job.id === DEMO_IDS.jobPaid);

export const JOB_FORM_TEMPLATES: FormFillTemplate[] = [
  {
    id: "pre-purchase",
    label: "Pre-purchase",
    fields: {
      customerId: "",
      customerName: tom?.name ?? "Tom Nguyen",
      suburb: tom?.suburb ?? "Randwick",
      phone: tom?.phone ?? "0412 000 222",
      email: tom?.email ?? "tom.nguyen@example.com",
      description: tomJob?.description ?? "Pre-purchase inspection, 3-bed terrace",
      propertyAddress: tomJob?.propertyAddress ?? "18 Blenheim Street, Randwick NSW 2031",
      vendorName: tomJob?.vendorName ?? "Harper Ellis",
      purchaserName: tomJob?.purchaserName ?? "Tom Nguyen",
      reportType: tomJob?.reportType ?? "pre_purchase",
      notes: tomJob?.notes ?? "",
    },
  },
  {
    id: "roof",
    label: "Roof leak",
    fields: {
      customerId: "",
      customerName: samira?.name ?? "Samira Chen",
      suburb: samira?.suburb ?? "Marrickville",
      phone: samira?.phone ?? "0412 000 111",
      email: samira?.email ?? "",
      description: roofJob?.description ?? "Roof leak after storms — inspection only",
      propertyAddress: roofJob?.propertyAddress ?? "22 Illawarra Road, Marrickville NSW 2204",
      vendorName: roofJob?.vendorName ?? "",
      purchaserName: roofJob?.purchaserName ?? "Samira Chen",
      reportType: roofJob?.reportType ?? "roof",
      notes: roofJob?.notes ?? "",
    },
  },
  {
    id: "safety",
    label: "Safety inspection",
    fields: {
      customerId: "",
      customerName: priya?.name ?? "Priya Shah",
      suburb: priya?.suburb ?? "Leichhardt",
      phone: priya?.phone ?? "",
      email: priya?.email ?? "priya.shah@example.com",
      description: safetyJob?.description ?? "Annual safety inspection",
      propertyAddress: safetyJob?.propertyAddress ?? "7 Flood Street, Leichhardt NSW 2040",
      vendorName: safetyJob?.vendorName ?? "",
      purchaserName: safetyJob?.purchaserName ?? "",
      reportType: safetyJob?.reportType ?? "safety",
      notes: safetyJob?.notes ?? "",
    },
  },
];
