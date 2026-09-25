/**
 * End-to-end check against the customer's real export (22/09/2026, 83,142 rows).
 * Expected values come from an independent Python/pandas implementation of the spec.
 * The file is private and git-ignored; the suite is skipped when it is absent.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import readXlsxFile from "read-excel-file/node";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildLookup, checkHeader, createAggregator, dateFromName, DEFAULT_RULES, firmwareBreakdown,
  formatRate, summarize, trend, type AggregateRow, type IngestReport,
} from "../src";

const FIXTURE = process.env.EVSA_FIXTURE ?? resolve(__dirname, "../../../fixtures/private/Data_raw.xlsx");
const lookup = buildLookup(DEFAULT_RULES);

describe.skipIf(!existsSync(FIXTURE))("golden: Data_raw.xlsx", () => {
  let rows: AggregateRow[];
  let report: IngestReport;
  let parseMs = 0;

  beforeAll(async () => {
    const t = performance.now();
    const [sheet] = await readXlsxFile(FIXTURE);
    const [header, ...data] = sheet!.data;
    const check = checkHeader(header!);
    expect(check.missingRequired).toEqual([]);
    const agg = createAggregator(check.index, dateFromName(sheet!.sheet));
    for (const r of data) agg.add(r);
    ({ rows, report } = agg.result());
    parseMs = performance.now() - t;
  }, 60_000);

  it("ingests every row into one report date", () => {
    expect(report).toMatchObject({ totalRows: 83142, rowsWithoutDate: 0, rowsUsingFallbackDate: 0, dates: ["2026-09-22"] });
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(83142);
    // Payload size that actually goes to the server.
    expect(rows.length).toBe(5431);
    console.info(`parse+aggregate: ${Math.round(parseMs)} ms, ${rows.length} aggregate rows`);
  });

  it("matches the KPI table", () => {
    const s = summarize(rows, lookup);
    expect(s).toMatchObject({ total: 83142, success: 75225, failed: 7917, evcs: 6360, nonEvcs: 1555, unclassified: 2 });
    expect(formatRate(s.rates.success)).toBe("90.48%");
    expect(formatRate(s.rates.failed)).toBe("9.52%");
    expect(formatRate(s.rates.evcs)).toBe("7.65%");
    expect(formatRate(s.rates.nonEvcs)).toBe("1.87%");
  });

  it("matches Top 3 EVCS reasons", () => {
    const top = summarize(rows, lookup).evcsReasons.slice(0, 3);
    expect(top.map((r) => [r.label, r.count, formatRate(r.rate)])).toEqual([
      ["EVDisconnected", 4114, "4.95%"],
      ["Not_Start_Charging", 1530, "1.84%"],
      ["TimeoutV2G", 278, "0.33%"],
    ]);
  });

  it("matches Non-EVCS labels and flags DoorAccess as unclassified", () => {
    const s = summarize(rows, lookup);
    expect(s.nonEvcsReasons.map((r) => [r.label, r.count])).toEqual([
      ["Stopped - Customer Owes Payment", 1318],
      ["EMERGENCY STOP", 162],
      ["EVDisconnected", 64],
      ["DeAuthorized", 10],
      ["PowerLoss", 1],
    ]);
    expect(s.unclassifiedReasons.map((r) => [r.label, r.count])).toEqual([["DoorAccess", 2]]);
  });

  it("matches the firmware × model breakdown", () => {
    const seg = firmwareBreakdown(rows, lookup, "260421").map((x) => [
      x.generation, x.model, x.summary.success, x.summary.evcs, x.summary.nonEvcs, x.summary.unclassified,
    ]);
    expect(seg).toEqual([
      ["old", "Core", 19401, 2029, 401, 0],
      ["old", "Kern", 3022, 353, 112, 0],
      ["new", "Core", 51800, 3920, 1014, 2],
      ["new", "Kern", 1002, 58, 28, 0],
    ]);
  });

  it("builds a trend whose single point equals the summary", () => {
    const t = trend(rows, lookup, "week");
    expect(t.topLabels).toEqual(["EVDisconnected", "Not_Start_Charging", "TimeoutV2G"]);
    expect(t.points).toHaveLength(1);
    expect(t.points[0]!.period).toBe("2026-W39");
    expect(formatRate(t.points[0]!.topReasonRates.EVDisconnected!)).toBe("4.95%");
  });
});
