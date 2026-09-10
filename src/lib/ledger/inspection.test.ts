import { describe, expect, it } from "vitest";
import { DEMO_IDS, demoSeed } from "../../data/demo-seed";
import { computeDocument } from "./tax";
import {
  inspectionPrintLines,
  parseInspectionFields,
  parsePartyName,
  parsePropertyAddress,
  parseReportType,
  reportTypeLabel,
} from "./inspection";

describe("parsePropertyAddress", () => {
  it("allows empty and trims", () => {
    expect(parsePropertyAddress("")).toBe("");
    expect(parsePropertyAddress("   ")).toBe("");
    expect(parsePropertyAddress(null)).toBe("");
    expect(parsePropertyAddress("  18 Blenheim Street, Randwick NSW 2031  ")).toBe(
      "18 Blenheim Street, Randwick NSW 2031",
    );
  });

  it("accepts 200 characters and rejects 201", () => {
    expect(parsePropertyAddress("p".repeat(200))).toBe("p".repeat(200));
    expect(parsePropertyAddress("p".repeat(201))).toBeNull();
  });
});

describe("parsePartyName", () => {
  it("allows empty and trims", () => {
    expect(parsePartyName("")).toBe("");
    expect(parsePartyName("  Harper Ellis  ")).toBe("Harper Ellis");
  });

  it("accepts 120 characters and rejects 121", () => {
    expect(parsePartyName("n".repeat(120))).toBe("n".repeat(120));
    expect(parsePartyName("n".repeat(121))).toBeNull();
  });
});

describe("parseReportType", () => {
  it("allows empty", () => {
    expect(parseReportType("")).toBe("");
    expect(parseReportType("   ")).toBe("");
    expect(parseReportType(undefined)).toBe("");
  });

  it("accepts the closed set and a few aliases", () => {
    expect(parseReportType("pre_purchase")).toBe("pre_purchase");
    expect(parseReportType("Pre-purchase")).toBe("pre_purchase");
    expect(parseReportType("pest")).toBe("pest");
    expect(parseReportType("building_pest")).toBe("building_pest");
    expect(parseReportType("roof")).toBe("roof");
    expect(parseReportType("annual")).toBe("safety");
    expect(parseReportType("storm")).toBe("storm");
    expect(parseReportType("other")).toBe("other");
  });

  it("rejects junk", () => {
    expect(parseReportType("scheduling")).toBeNull();
    expect(parseReportType("gps")).toBeNull();
    expect(parseReportType("portal")).toBeNull();
  });
});

describe("reportTypeLabel", () => {
  it("labels stored values and treats empty or junk as blank", () => {
    expect(reportTypeLabel("pre_purchase")).toBe("Pre-purchase building");
    expect(reportTypeLabel("pest")).toBe("Pest");
    expect(reportTypeLabel("building_pest")).toBe("Building and pest");
    expect(reportTypeLabel("")).toBe("");
    expect(reportTypeLabel("gps")).toBe("");
  });
});

describe("parseInspectionFields", () => {
  it("accepts all empty", () => {
    expect(
      parseInspectionFields({
        propertyAddress: "",
        vendorName: "",
        purchaserName: "",
        reportType: "",
      }),
    ).toEqual({
      propertyAddress: "",
      vendorName: "",
      purchaserName: "",
      reportType: "",
    });
  });

  it("rejects over-long property or a junk report type", () => {
    expect(
      parseInspectionFields({
        propertyAddress: "p".repeat(201),
        vendorName: "",
        purchaserName: "",
        reportType: "",
      }),
    ).toBeNull();
    expect(
      parseInspectionFields({
        propertyAddress: "18 Blenheim Street, Randwick NSW 2031",
        vendorName: "",
        purchaserName: "",
        reportType: "scheduling",
      }),
    ).toBeNull();
  });
});

describe("inspectionPrintLines", () => {
  it("omits empty fields and never invents a report label", () => {
    expect(
      inspectionPrintLines({
        propertyAddress: "",
        vendorName: "",
        purchaserName: "",
        reportType: "",
      }),
    ).toEqual([]);
    expect(
      inspectionPrintLines({
        propertyAddress: "18 Blenheim Street, Randwick NSW 2031",
        vendorName: "Harper Ellis",
        purchaserName: "Tom Nguyen",
        reportType: "pre_purchase",
      }),
    ).toEqual([
      { label: "Property", value: "18 Blenheim Street, Randwick NSW 2031" },
      { label: "Report", value: "Pre-purchase building" },
      { label: "Vendor", value: "Harper Ellis" },
      { label: "Purchaser", value: "Tom Nguyen" },
    ]);
  });
});

describe("demo inspection fields", () => {
  it("pins Tom Q-0001 property and report without changing GST money", () => {
    const quoted = demoSeed.jobs.find((job) => job.id === DEMO_IDS.jobQuoted);
    expect(quoted?.propertyAddress).toBe("18 Blenheim Street, Randwick NSW 2031");
    expect(quoted?.vendorName).toBe("Harper Ellis");
    expect(quoted?.purchaserName).toBe("Tom Nguyen");
    expect(quoted?.reportType).toBe("pre_purchase");
    const mixed = demoSeed.quotes.find((quote) => quote.docNumber === "Q-0001");
    expect(computeDocument(mixed!.lines).gstCents).toBe(11000);
    expect(computeDocument(mixed!.lines).totalCents).toBe(123200);
  });

  it("leaves Priya vendor and purchaser empty and copies Samira onto the duplicate", () => {
    const paid = demoSeed.jobs.find((job) => job.id === DEMO_IDS.jobPaid);
    expect(paid?.propertyAddress).toBe("7 Flood Street, Leichhardt NSW 2040");
    expect(paid?.vendorName).toBe("");
    expect(paid?.purchaserName).toBe("");
    expect(paid?.reportType).toBe("safety");
    const enquiry = demoSeed.jobs.find((job) => job.id === DEMO_IDS.jobEnquiry);
    const copy = demoSeed.jobs.find((job) => job.id === DEMO_IDS.jobDuplicate);
    expect(copy?.propertyAddress).toBe(enquiry?.propertyAddress);
    expect(copy?.vendorName).toBe(enquiry?.vendorName);
    expect(copy?.purchaserName).toBe(enquiry?.purchaserName);
    expect(copy?.reportType).toBe(enquiry?.reportType);
  });
});
