/**
 * KPI maths over rows the API has already classified (ReportRow / StationRow).
 * Same definitions as summary.ts (spec section 5); parity is covered by tests.
 */
import type { FirmwareDim, Generation, ReportRow, StationRow } from "./api";
import type { ChargerModel } from "./firmware";
import type { ReasonStat, Summary } from "./summary";
import { Category } from "./types";

type Classified = Pick<ReportRow, "cat" | "label" | "n"> & { code?: string | null };

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);

export function summarizeClassified(rows: Iterable<Classified>): Summary {
  let total = 0, success = 0, evcs = 0, nonEvcs = 0, unclassified = 0;
  const maps = {
    [Category.EvcsFault]: new Map<string, { code: string | null; count: number }>(),
    [Category.NonEvcsFault]: new Map<string, { code: string | null; count: number }>(),
    [Category.Unclassified]: new Map<string, { code: string | null; count: number }>(),
  };
  for (const r of rows) {
    total += r.n;
    if (r.cat === Category.Success) {
      success += r.n;
      continue;
    }
    if (r.cat === Category.EvcsFault) evcs += r.n;
    else if (r.cat === Category.NonEvcsFault) nonEvcs += r.n;
    else unclassified += r.n;
    const m = maps[r.cat];
    const e = m.get(r.label);
    if (e) e.count += r.n;
    else m.set(r.label, { code: r.code ?? null, count: r.n });
  }
  const rank = (m: Map<string, { code: string | null; count: number }>): ReasonStat[] =>
    [...m.entries()]
      .map(([label, v]) => ({ label, code: v.code, count: v.count, rate: ratio(v.count, total) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const failed = total - success;
  return {
    total, success, failed, evcs, nonEvcs, unclassified,
    rates: { success: ratio(success, total), failed: ratio(failed, total), evcs: ratio(evcs, total), nonEvcs: ratio(nonEvcs, total) },
    evcsReasons: rank(maps[Category.EvcsFault]),
    nonEvcsReasons: rank(maps[Category.NonEvcsFault]),
    unclassifiedReasons: rank(maps[Category.Unclassified]),
  };
}

function group<T, K>(rows: Iterable<T>, key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const l = out.get(k);
    if (l) l.push(r);
    else out.set(k, [r]);
  }
  return out;
}

export interface PeriodSummary {
  period: string;
  summary: Summary;
}

/** One summary per period, in chronological order. */
export function byPeriod(rows: readonly ReportRow[]): PeriodSummary[] {
  return [...group(rows, (r) => r.p).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, g]) => ({ period, summary: summarizeClassified(g) }));
}

/** Rate of `label` within EVCS faults for a period summary (denominator: total transactions). */
export const evcsReasonRate = (s: Summary, label: string) => s.evcsReasons.find((r) => r.label === label)?.rate ?? 0;

export interface SegmentKey {
  generation: Generation;
  model: ChargerModel;
}

export function firmwareIndex(dims: readonly FirmwareDim[]) {
  const m = new Map(dims.map((d) => [d.firmware, d]));
  return (fw: string): SegmentKey => {
    const d = m.get(fw);
    return d ? { generation: d.generation, model: d.model } : { generation: "unknown", model: "Other" };
  };
}

export interface StationStat {
  station: string;
  /** Leading province/area code of ma_tram, e.g. "HNO" from "C.HNO0123". */
  region: string;
  total: number;
  evcs: number;
  nonEvcs: number;
  unclassified: number;
  evcsRate: number;
  failedRate: number;
  topEvcs: { label: string; count: number } | null;
}

export const regionOf = (station: string) => /^[A-Z]\.([A-Z]{2,4})/.exec(station)?.[1] ?? "—";

export function stationStats(rows: readonly StationRow[]): StationStat[] {
  return [...group(rows, (r) => r.station).entries()].map(([station, g]) => {
    const s = summarizeClassified(g);
    const top = s.evcsReasons[0];
    return {
      station, region: regionOf(station), total: s.total, evcs: s.evcs, nonEvcs: s.nonEvcs,
      unclassified: s.unclassified, evcsRate: s.rates.evcs, failedRate: s.rates.failed,
      topEvcs: top ? { label: top.label, count: top.count } : null,
    };
  });
}
