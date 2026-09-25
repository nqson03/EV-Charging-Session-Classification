import { classify } from "./classify";
import { isoWeek, monthKey } from "./dates";
import { firmwareGeneration, parseFirmware, type ChargerModel, type FirmwareGeneration } from "./firmware";
import type { RuleLookup } from "./rules";
import { Category, type AggregateRow, type Classification } from "./types";

export type Period = "day" | "week" | "month";

export interface ReasonStat {
  label: string;
  code: string | null;
  count: number;
  /** count / total transactions in scope (spec section 5). */
  rate: number;
}

export interface Summary {
  total: number;
  success: number;
  /** Everything that is not Success, Unclassified included. */
  failed: number;
  evcs: number;
  nonEvcs: number;
  unclassified: number;
  rates: { success: number; failed: number; evcs: number; nonEvcs: number };
  evcsReasons: ReasonStat[];
  nonEvcsReasons: ReasonStat[];
  /** Not part of the KPI table, but must be flagged on the dashboard. */
  unclassifiedReasons: ReasonStat[];
}

/** Classifies each aggregate once per distinct (reason, emspEmpty) pair. */
export function makeClassifier(lookup: RuleLookup) {
  const memo = new Map<string, Classification>();
  return (row: Pick<AggregateRow, "reason" | "emspEmpty">): Classification => {
    const key = `${row.reason ?? ""}\u0000${row.emspEmpty ? 1 : 0}`;
    let c = memo.get(key);
    if (!c) {
      c = classify(row.reason, row.emspEmpty, lookup);
      memo.set(key, c);
    }
    return c;
  };
}

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);

function rank(map: Map<string, { code: string | null; count: number }>, total: number): ReasonStat[] {
  return [...map.entries()]
    .map(([label, v]) => ({ label, code: v.code, count: v.count, rate: ratio(v.count, total) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function summarize(rows: Iterable<AggregateRow>, lookup: RuleLookup): Summary {
  const cls = makeClassifier(lookup);
  let total = 0, success = 0, evcs = 0, nonEvcs = 0, unclassified = 0;
  const byCat = {
    [Category.EvcsFault]: new Map<string, { code: string | null; count: number }>(),
    [Category.NonEvcsFault]: new Map<string, { code: string | null; count: number }>(),
    [Category.Unclassified]: new Map<string, { code: string | null; count: number }>(),
  };

  for (const row of rows) {
    const c = cls(row);
    total += row.count;
    if (c.category === Category.Success) {
      success += row.count;
      continue;
    }
    if (c.category === Category.EvcsFault) evcs += row.count;
    else if (c.category === Category.NonEvcsFault) nonEvcs += row.count;
    else unclassified += row.count;
    const m = byCat[c.category];
    const e = m.get(c.label);
    if (e) e.count += row.count;
    else m.set(c.label, { code: c.code, count: row.count });
  }

  const failed = total - success;
  return {
    total, success, failed, evcs, nonEvcs, unclassified,
    rates: {
      success: ratio(success, total),
      failed: ratio(failed, total),
      evcs: ratio(evcs, total),
      nonEvcs: ratio(nonEvcs, total),
    },
    evcsReasons: rank(byCat[Category.EvcsFault], total),
    nonEvcsReasons: rank(byCat[Category.NonEvcsFault], total),
    unclassifiedReasons: rank(byCat[Category.Unclassified], total),
  };
}

export const periodKey = (date: string, period: Period) =>
  period === "day" ? date : period === "week" ? isoWeek(date) : monthKey(date);

function groupBy<K>(rows: Iterable<AggregateRow>, key: (r: AggregateRow) => K): Map<K, AggregateRow[]> {
  const out = new Map<K, AggregateRow[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

export interface TrendPoint {
  period: string;
  total: number;
  failedRate: number;
  evcsRate: number;
  nonEvcsRate: number;
  /** Rate per label in `topLabels`, same denominator (total of the period). */
  topReasonRates: Record<string, number>;
}

export interface Trend {
  period: Period;
  /** Top-N EVCS reasons over the whole range, so every point tracks the same reasons. */
  topLabels: string[];
  points: TrendPoint[];
}

/** Overview trend (slide 2) and Top-N EVCS reason trend (slides 3 and 5). */
export function trend(rows: AggregateRow[], lookup: RuleLookup, period: Period, topN = 3): Trend {
  const topLabels = summarize(rows, lookup).evcsReasons.slice(0, topN).map((r) => r.label);
  const points = [...groupBy(rows, (r) => periodKey(r.date, period)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, group]) => {
      const s = summarize(group, lookup);
      const byLabel = new Map(s.evcsReasons.map((r) => [r.label, r.rate]));
      return {
        period: p,
        total: s.total,
        failedRate: s.rates.failed,
        evcsRate: s.rates.evcs,
        nonEvcsRate: s.rates.nonEvcs,
        topReasonRates: Object.fromEntries(topLabels.map((l) => [l, byLabel.get(l) ?? 0])),
      };
    });
  return { period, topLabels, points };
}

export interface FirmwareSegment {
  generation: FirmwareGeneration | "unknown";
  model: ChargerModel;
  summary: Summary;
}

/** Old vs new firmware, broken down by charger model (slide 4). */
export function firmwareBreakdown(rows: AggregateRow[], lookup: RuleLookup, newFrom: string): FirmwareSegment[] {
  const info = new Map<string, { generation: FirmwareGeneration | "unknown"; model: ChargerModel }>();
  const seg = (fw: string) => {
    let v = info.get(fw);
    if (!v) {
      const p = parseFirmware(fw);
      v = { generation: firmwareGeneration(p, newFrom) ?? "unknown", model: p.model };
      info.set(fw, v);
    }
    return v;
  };
  const groups = groupBy(rows, (r) => {
    const s = seg(r.firmware);
    return `${s.generation}|${s.model}`;
  });
  const genOrder = { old: 0, new: 1, unknown: 2 } as const;
  const modelOrder: ChargerModel[] = ["Core", "Kern", "AC", "Other"];
  return [...groups.entries()]
    .map(([k, g]) => {
      const [generation, model] = k.split("|") as [FirmwareSegment["generation"], ChargerModel];
      return { generation, model, summary: summarize(g, lookup) };
    })
    .sort((a, b) => genOrder[a.generation] - genOrder[b.generation] || modelOrder.indexOf(a.model) - modelOrder.indexOf(b.model));
}

/** Percent with exactly 2 decimals, as required on every chart (spec section 5). */
export function formatRate(r: number): string {
  return `${(Math.round(r * 10000) / 100).toFixed(2)}%`;
}
