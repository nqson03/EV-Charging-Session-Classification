import { describe, expect, it } from "vitest";
import { dateFromName, firmwareGeneration, formatRate, isoWeek, parseFirmware, toReportDate } from "../src";

describe("parseFirmware", () => {
  it.each([
    ["260421CCDC60Core", "260421", "Core", 60, null],
    ["260421CCDC120Core_L", "260421", "Core", 120, "L"],
    ["251024CCDC30Kern", "251024", "Kern", 30, null],
    ["251024CCDCKern20_L", "251024", "Kern", 20, "L"], // inconsistent ordering in source
    ["260421CCDC20Kern_L", "260421", "Kern", 20, "L"],
  ])("%s", (raw, build, model, kw, variant) => {
    expect(parseFirmware(raw)).toMatchObject({ build, model, ratingKw: kw, variant });
  });

  it("dates the build stamp and splits generations by cut-off", () => {
    const p = parseFirmware("251024CCDC60Core");
    expect(p.buildDate).toBe("2025-10-24");
    expect(firmwareGeneration(p, "260421")).toBe("old");
    expect(firmwareGeneration(parseFirmware("260421CCDC60Core"), "260421")).toBe("new");
    expect(firmwareGeneration(parseFirmware("garbage"), "260421")).toBeNull();
  });
});

describe("dates", () => {
  it("reads the source format and common alternatives", () => {
    expect(toReportDate("22/09/2026 23:58:07")).toBe("2026-09-22");
    expect(toReportDate("2026-09-22T23:58:07")).toBe("2026-09-22");
    expect(toReportDate(new Date(Date.UTC(2026, 8, 22, 23, 58)))).toBe("2026-09-22");
    expect(toReportDate(46287.99)).toBe("2026-09-22");
    expect(toReportDate("31/02/2026 00:00:00")).toBeNull();
    expect(toReportDate("")).toBeNull();
  });

  it("finds a yymmdd date in sheet or file names", () => {
    expect(dateFromName("260922_Transaction")).toBe("2026-09-22");
    expect(dateFromName("Data_raw.xlsx")).toBeNull();
  });

  it("uses ISO weeks", () => {
    expect(isoWeek("2026-09-22")).toBe("2026-W39");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
});

describe("formatRate", () => {
  it("always shows two decimals", () => {
    expect(formatRate(0.9048)).toBe("90.48%");
    expect(formatRate(0.1)).toBe("10.00%");
    expect(formatRate(0)).toBe("0.00%");
    expect(formatRate(4114 / 83142)).toBe("4.95%");
  });
});
