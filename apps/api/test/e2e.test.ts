/**
 * End-to-end: real file → browser-side aggregation → chunked upload → D1 → report API.
 * Run against a live dev server:  pnpm dev  (in apps/api), then  API_URL=http://localhost:8787 pnpm test:e2e
 * Needs fixtures/private/Data_raw.xlsx (git-ignored). Skipped otherwise.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import readXlsxFile from "read-excel-file/node";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildDayPayloads, buildLookup, checkHeader, createAggregator, dateFromName, DEFAULT_RULES, firmwareIndex,
  formatRate, stationStats, summarize, summarizeClassified, uploadDay,
  type AggregateRow, type ReportResponse, type RulesResponse, type StationsResponse,
} from "@evsa/core";

const API = process.env.API_URL;
const FIXTURE = resolve(__dirname, "../../../fixtures/private/Data_raw.xlsx");
const DAY = "2026-09-22";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error}`);
  return json;
}
const post = <T>(path: string, body: unknown) => call<T>("POST", path, body);
const report = (period = "day") => call<ReportResponse>("GET", `/api/report?from=${DAY}&to=${DAY}&period=${period}`);

describe.skipIf(!API || !existsSync(FIXTURE))("e2e against wrangler dev", () => {
  let rows: AggregateRow[];

  beforeAll(async () => {
    const [sheet] = await readXlsxFile(FIXTURE);
    const [header, ...data] = sheet!.data;
    const agg = createAggregator(checkHeader(header!).index, dateFromName(sheet!.sheet));
    for (const r of data) agg.add(r);
    rows = agg.result().rows;
    // Start clean; ignore 404 when nothing is there yet.
    await call("DELETE", `/api/uploads/${DAY}`).catch(() => undefined);
    await post("/api/rules/reset", {});
  }, 120_000);

  it("uploads in chunks and reconciles", async () => {
    const [day] = buildDayPayloads(rows);
    expect(day!.segment.length).toBeLessThan(200);
    expect(day!.station.length).toBeLessThan(6000);
    const t = performance.now();
    const res = await uploadDay(post, day!, "Data_raw.xlsx");
    console.info(`upload: ${Math.round(performance.now() - t)} ms, ${day!.segment.length} + ${day!.station.length} rows`);
    expect(res.replaced).toBe(false);
  }, 60_000);

  it("report matches the golden KPI table and the local engine", async () => {
    const r = await report();
    expect(r.dates).toEqual([DAY]);
    const s = summarizeClassified(r.rows);
    expect(s).toMatchObject({ total: 83142, success: 75225, failed: 7917, evcs: 6360, nonEvcs: 1555, unclassified: 2 });
    expect([s.rates.success, s.rates.evcs, s.rates.nonEvcs].map(formatRate)).toEqual(["90.48%", "7.65%", "1.87%"]);
    expect(s.evcsReasons.slice(0, 3).map((x) => [x.label, x.count])).toEqual([
      ["EVDisconnected", 4114], ["Not_Start_Charging", 1530], ["TimeoutV2G", 278],
    ]);
    // Server-side classification must equal the shared engine run locally.
    const local = summarize(rows, buildLookup(DEFAULT_RULES));
    expect(s).toEqual(local);
  });

  it("segments by firmware generation × model", async () => {
    const r = await report("month");
    const seg = firmwareIndex(r.firmware);
    const counts = new Map<string, number>();
    for (const row of r.rows) {
      if (row.cat !== "EVCS Fault") continue;
      const k = `${seg(row.fw).generation}/${seg(row.fw).model}`;
      counts.set(k, (counts.get(k) ?? 0) + row.n);
    }
    expect(Object.fromEntries(counts)).toEqual({ "old/Core": 2029, "old/Kern": 353, "new/Core": 3920, "new/Kern": 58 });
  });

  it("station view sums to the same total", async () => {
    const r = await call<StationsResponse>("GET", `/api/stations?from=${DAY}&to=${DAY}`);
    const st = stationStats(r.rows);
    expect(st.length).toBe(2123);
    expect(st.reduce((n, x) => n + x.total, 0)).toBe(83142);
    expect(st.reduce((n, x) => n + x.evcs, 0)).toBe(6360);
  });

  it("re-classifies history when a rule is added, and back when removed", async () => {
    await call("PUT", "/api/rules/DoorAccess", { code: null, aliases: [], category: "EVCS Fault" });
    let s = summarizeClassified((await report()).rows);
    expect(s).toMatchObject({ evcs: 6362, unclassified: 0 });
    const rules = await call<RulesResponse>("GET", "/api/rules");
    expect(rules.changes[0]).toMatchObject({ action: "create", name: "DoorAccess" });

    await call("DELETE", "/api/rules/DoorAccess");
    s = summarizeClassified((await report()).rows);
    expect(s).toMatchObject({ evcs: 6360, unclassified: 2 });
  });

  it("rejects a rule that collides with an existing alias", async () => {
    await expect(call("PUT", "/api/rules/EmergencyStop", { category: "EVCS Fault", aliases: [] })).rejects.toThrow(/409/);
  });

  it("replaces a day on re-upload without double counting", async () => {
    const [day] = buildDayPayloads(rows);
    const res = await uploadDay(post, day!, "Data_raw (2).xlsx");
    expect(res.replaced).toBe(true);
    expect(summarizeClassified((await report()).rows).total).toBe(83142);
  }, 60_000);
});
