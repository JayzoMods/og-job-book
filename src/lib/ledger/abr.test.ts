import { describe, expect, it, vi } from "vitest";
import {
  abrGuidFromEnv,
  abrLookupConfigured,
  describeAbrLookup,
  describeOrgGstVsAbr,
  lookupAbnDetails,
  parseAbrJsonp,
} from "./abr";
import { formatIsoDateAu } from "./print";

const EXAMPLE_ABN = "51 824 753 556";
const TEST_GUID = "11111111-2222-3333-4444-555555555555";

function jsonpResponse(payload: unknown, status = 200): Response {
  return new Response(`callback(${JSON.stringify(payload)})`, { status });
}

const foundGst: Extract<
  Awaited<ReturnType<typeof lookupAbnDetails>>,
  { status: "found" }
> = {
  status: "found",
  abn: EXAMPLE_ABN,
  entityName: "OG DIGITAL DESIGNS",
  abnStatus: "Active",
  abnStatusEffectiveFrom: "2020-01-01",
  gstFrom: "2020-07-01",
  entityTypeName: "Individual/Sole Trader",
  state: "NSW",
  postcode: "2000",
};

describe("parseAbrJsonp", () => {
  it("unwraps the ABR callback wrapper", () => {
    const payload = parseAbrJsonp(
      `callback({"Abn":"51824753556","EntityName":"Example","Message":""})`,
    );
    expect(payload).toEqual({
      Abn: "51824753556",
      EntityName: "Example",
      Message: "",
    });
  });

  it("rejects a body that is not JSONP", () => {
    expect(() => parseAbrJsonp(`{"Abn":"1"}`)).toThrow(/JSONP/);
  });
});

describe("abrGuidFromEnv", () => {
  it("treats blank as unset", () => {
    expect(abrGuidFromEnv({})).toBeUndefined();
    expect(abrGuidFromEnv({ ABR_GUID: "  " })).toBeUndefined();
    expect(abrGuidFromEnv({ ABR_GUID: TEST_GUID })).toBe(TEST_GUID);
    expect(abrLookupConfigured({})).toBe(false);
    expect(abrLookupConfigured({ ABR_GUID: TEST_GUID })).toBe(true);
  });
});

describe("describeAbrLookup", () => {
  it("explains the no-guid path", () => {
    expect(describeAbrLookup({ status: "skipped", reason: "no_guid" }, EXAMPLE_ABN)).toMatch(
      /not available/,
    );
  });

  it("does not claim a checksum pass when the ABN is invalid", () => {
    expect(
      describeAbrLookup({ status: "skipped", reason: "invalid_abn" }, "00 000 000 000"),
    ).toMatch(/does not pass the ABR modulus-89 checksum/);
  });

  it("formats a GST-registered entity", () => {
    expect(describeAbrLookup(foundGst, EXAMPLE_ABN)).toBe(
      `ABR: OG DIGITAL DESIGNS (Active). GST registered from ${formatIsoDateAu("2020-07-01")}.`,
    );
  });

  it("formats a missing GST registration", () => {
    expect(
      describeAbrLookup({ ...foundGst, gstFrom: null, entityName: "Example Pty Ltd" }, EXAMPLE_ABN),
    ).toMatch(/does not show a current GST registration/);
  });
});

describe("describeOrgGstVsAbr", () => {
  it("flags org GST-on when ABR has no GST date", () => {
    expect(describeOrgGstVsAbr({ ...foundGst, gstFrom: null }, true)).toMatch(
      /marked GST registered/,
    );
  });

  it("flags org GST-off when ABR has a GST date", () => {
    expect(describeOrgGstVsAbr(foundGst, false)).toMatch(/marked not GST registered/);
  });

  it("is silent when the checkbox and ABR GST date agree", () => {
    expect(describeOrgGstVsAbr(foundGst, true)).toBeNull();
    expect(describeOrgGstVsAbr({ ...foundGst, gstFrom: null }, false)).toBeNull();
  });

  it("does not flag skipped or error lookups", () => {
    expect(describeOrgGstVsAbr({ status: "skipped", reason: "no_guid" }, true)).toBeNull();
    expect(
      describeOrgGstVsAbr({ status: "error", reason: "network", message: "timed out" }, true),
    ).toBeNull();
  });
});

describe("lookupAbnDetails", () => {
  it("does not fetch a checksum failure, even with a GUID", async () => {
    const fetchImpl = vi.fn();
    await expect(
      lookupAbnDetails("00000000000", { guid: TEST_GUID, fetchImpl }),
    ).resolves.toEqual({ status: "skipped", reason: "invalid_abn" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not fetch empty input", async () => {
    const fetchImpl = vi.fn();
    await expect(lookupAbnDetails("", { guid: TEST_GUID, fetchImpl })).resolves.toEqual({
      status: "skipped",
      reason: "invalid_abn",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats an invalid ABN as checksum skip when the GUID is also missing", async () => {
    const fetchImpl = vi.fn();
    await expect(lookupAbnDetails("123", { guid: "", fetchImpl })).resolves.toEqual({
      status: "skipped",
      reason: "invalid_abn",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not fetch when the GUID is missing", async () => {
    const fetchImpl = vi.fn();
    await expect(lookupAbnDetails(EXAMPLE_ABN, { guid: "", fetchImpl })).resolves.toEqual({
      status: "skipped",
      reason: "no_guid",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps entity name and GST date from JSONP", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("abn=51824753556");
      expect(url).toContain(`guid=${TEST_GUID}`);
      expect(url).toContain("callback=callback");
      return jsonpResponse({
        Abn: "51 824 753 556",
        AbnStatus: "Active",
        AbnStatusEffectiveFrom: "1999-11-01",
        EntityName: "AUSTRALIAN TAXATION OFFICE",
        EntityTypeName: "Commonwealth Government Entity",
        Gst: "2000-07-01",
        AddressState: "ACT",
        AddressPostcode: "2600",
        Message: "",
      });
    });

    await expect(
      lookupAbnDetails(EXAMPLE_ABN, { guid: TEST_GUID, fetchImpl }),
    ).resolves.toMatchObject({
      status: "found",
      entityName: "AUSTRALIAN TAXATION OFFICE",
      abnStatus: "Active",
      gstFrom: "2000-07-01",
    });
  });

  it("treats an ABR Message with no entity as an ABR error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonpResponse({
        Abn: "",
        AbnStatus: "",
        EntityName: "",
        Gst: null,
        Message: "The GUID entered is not recognised as a Registered Party",
      }),
    );

    const result = await lookupAbnDetails(EXAMPLE_ABN, { guid: TEST_GUID, fetchImpl });
    expect(result).toEqual({
      status: "error",
      reason: "abr",
      message: "The GUID entered is not recognised as a Registered Party",
    });
    expect(JSON.stringify(result)).not.toContain(TEST_GUID);
  });

  it("returns a generic network error that does not include the GUID", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`getaddrinfo ENOTFOUND abr.business.gov.au guid=${TEST_GUID}`);
    });

    const result = await lookupAbnDetails(EXAMPLE_ABN, { guid: TEST_GUID, fetchImpl });
    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain(TEST_GUID);
    expect(JSON.stringify(result)).not.toContain("ENOTFOUND");
  });

  it("maps HTTP failures without fetching a body", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    await expect(
      lookupAbnDetails(EXAMPLE_ABN, { guid: TEST_GUID, fetchImpl }),
    ).resolves.toEqual({ status: "error", reason: "http", message: "HTTP 503" });
  });

  it("maps a non-JSONP body to parse, not network", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>nope</html>", { status: 200 }));
    await expect(
      lookupAbnDetails(EXAMPLE_ABN, { guid: TEST_GUID, fetchImpl }),
    ).resolves.toEqual({ status: "error", reason: "parse", message: "invalid JSONP" });
  });

  it("maps timeout to a network error without the GUID", async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error(`aborted guid=${TEST_GUID}`);
      error.name = "TimeoutError";
      throw error;
    });
    const result = await lookupAbnDetails(EXAMPLE_ABN, { guid: TEST_GUID, fetchImpl });
    expect(result).toEqual({ status: "error", reason: "network", message: "timed out" });
    expect(JSON.stringify(result)).not.toContain(TEST_GUID);
  });
});
