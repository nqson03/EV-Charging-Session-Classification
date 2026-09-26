/// <reference lib="webworker" />
/**
 * Parsing and export run here so an 80k-row file never blocks the UI thread.
 * The raw rows stay in this worker; only aggregated counts go back to the page.
 */
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/web-worker";
import writeExcelFile from "write-excel-file/universal";
import {
  buildLookup, Category, checkHeader, classify, COL, createAggregator, dateFromName, summarize,
  type AggregateRow, type StopReasonRule,
} from "@evsa/core";
import type { ParsedFile, WorkerRequest, WorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const NO_DATE = "0000-00-00";
let current: { header: string[]; data: unknown[][]; fileName: string; rows: AggregateRow[] } | null = null;

async function readRows(file: File): Promise<{ sheetName: string | null; header: unknown[]; data: unknown[][] }> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    const text = await file.text();
    const res = Papa.parse<unknown[]>(text, { skipEmptyLines: "greedy" });
    const [header = [], ...data] = res.data;
    return { sheetName: null, header, data };
  }
  const sheets = await readXlsxFile(file);
  const sheet = sheets[0];
  if (!sheet) throw new Error("The workbook has no sheets.");
  const [header = [], ...data] = sheet.data as unknown[][];
  return { sheetName: sheet.sheet, header, data };
}

async function parse(file: File): Promise<ParsedFile> {
  const t0 = performance.now();
  const { sheetName, header, data } = await readRows(file);
  const check = checkHeader(header);
  const nameDate = (sheetName && dateFromName(sheetName)) || dateFromName(file.name);
  const agg = createAggregator(check.index, NO_DATE);
  for (const row of data) agg.add(row);
  const { rows, report } = agg.result();

  const dateCounts: Record<string, number> = {};
  for (const r of rows) if (r.date !== NO_DATE) dateCounts[r.date] = (dateCounts[r.date] ?? 0) + r.count;

  current = { header: header.map((h) => String(h ?? "")), data, fileName: file.name, rows };
  return {
    fileName: file.name,
    size: file.size,
    sheetName,
    columns: current.header,
    missingRequired: check.missingRequired,
    missingRecommended: check.missingRecommended,
    missingDimensions: check.missingDimensions,
    totalRows: report.totalRows,
    rowsWithoutEndTime: report.rowsUsingFallbackDate,
    dateCounts,
    nameDate,
    rows,
    parseMs: Math.round(performance.now() - t0),
  };
}

async function exportClassified(rules: StopReasonRule[], reportDate: string): Promise<Blob> {
  if (!current) throw new Error("No file loaded.");
  const lookup = buildLookup(rules);
  const { header, data } = current;
  const iReason = header.findIndex((h) => h.trim().toLowerCase() === COL.reason);
  const iEmsp = header.findIndex((h) => h.trim().toLowerCase() === COL.emsp);

  const bold = (v: string) => ({ value: v, fontWeight: "bold" as const });
  const detail: unknown[][] = [[...header.map(bold), bold("Classification"), bold("Stat_Label"), bold("Error_Code")]];
  for (const row of data) {
    const reason = row[iReason];
    const emsp = row[iEmsp];
    const c = classify(reason == null ? null : String(reason), emsp == null ? null : String(emsp), lookup);
    const cells = header.map((_, i) => {
      const v = row[i];
      return v === undefined || v === "" ? null : v;
    });
    detail.push([...cells, c.category, c.label, c.code]);
  }

  const s = summarize(current.rows, lookup);
  const rate = (v: number) => ({ value: v, format: "0.00%" });
  const summary: unknown[][] = [
    [bold("Metric"), bold("Value"), bold("Rate")],
    ["Report Date", reportDate, null],
    ["Total Transactions", s.total, null],
    ["Total Success", s.success, rate(s.rates.success)],
    ["Total Failed", s.failed, rate(s.rates.failed)],
    ["Failed EVCS related", s.evcs, rate(s.rates.evcs)],
    ["Failed Non-EVCS related", s.nonEvcs, rate(s.rates.nonEvcs)],
    [null, null, null],
    [bold("Top 3 Failed Reason (EVCS Fault only)"), bold("Transactions"), bold("Rate")],
    ...s.evcsReasons.slice(0, 3).map((r, i) => [`${i + 1}. ${r.label}${r.code ? ` (${r.code})` : ""}`, r.count, rate(r.rate)]),
  ];
  if (s.unclassified) {
    summary.push([null, null, null], [bold(`Warning: ${s.unclassified} transaction(s) are ${Category.Unclassified}`), null, null]);
    for (const r of s.unclassifiedReasons) summary.push([r.label, r.count, null]);
  }

  // write-excel-file's typings are strict about cell shapes; the data above follows its documented format.
  const write = writeExcelFile as unknown as (sheets: unknown[]) => { toBlob(): Promise<Blob> };
  return write([
    { sheet: "Classified", data: detail, stickyRowsCount: 1 },
    { sheet: "Summary_Stats", data: summary, columns: [{ width: 42 }, { width: 16 }, { width: 12 }] },
  ]).toBlob();
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  const reply = (r: WorkerResponse) => self.postMessage(r);
  try {
    if (msg.type === "parse") reply({ id: msg.id, ok: true, result: await parse(msg.file) });
    else if (msg.type === "export") reply({ id: msg.id, ok: true, result: await exportClassified(msg.rules, msg.reportDate) });
    else if (msg.type === "clear") {
      current = null;
      reply({ id: msg.id, ok: true, result: null });
    }
  } catch (err) {
    reply({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
