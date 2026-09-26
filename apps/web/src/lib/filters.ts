import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import type { Meta, Period } from "@evsa/core";
import { addDays, daysInclusive, monthStart } from "./dates";

export type Preset = "latest" | "7d" | "30d" | "90d" | "mtd" | "all" | "custom";

export const PRESETS: { id: Exclude<Preset, "custom">; label: string }[] = [
  { id: "latest", label: "Latest day" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "mtd", label: "Month to date" },
  { id: "all", label: "All data" },
];

export const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Suggested granularity so a chart never gets hundreds of points. */
export const autoPeriod = (from: string, to: string): Period => {
  const n = daysInclusive(from, to);
  return n <= 45 ? "day" : n <= 180 ? "week" : "month";
};

export interface Filters {
  ready: boolean;
  from: string;
  to: string;
  period: Period;
  periodIsAuto: boolean;
  preset: Preset;
  /** Newest / oldest date with a completed upload. */
  latest: string | null;
  earliest: string | null;
  days: number;
  setPreset: (p: Exclude<Preset, "custom">) => void;
  setCustom: (from: string, to: string) => void;
  setPeriod: (p: Period | "auto") => void;
}

/**
 * Global filters live in the URL so a view can be bookmarked or shared. Presets are
 * relative to the newest uploaded day, not to today: data arrives with a lag.
 */
export function useFilters(meta: Meta | undefined): Filters {
  const [params, setParams] = useSearchParams();
  const complete = useMemo(
    () => (meta?.uploads ?? []).filter((u) => u.status === "complete").map((u) => u.date).sort(),
    [meta],
  );
  const latest = complete.at(-1) ?? null;
  const earliest = complete[0] ?? null;

  const preset = (params.get("range") as Preset | null) ?? "30d";
  let from = "", to = "";
  if (latest && earliest) {
    to = latest;
    switch (preset) {
      case "latest": from = latest; break;
      case "7d": from = addDays(latest, -6); break;
      case "90d": from = addDays(latest, -89); break;
      case "mtd": from = monthStart(latest); break;
      case "all": from = earliest; break;
      case "custom": {
        const f = params.get("from"), t = params.get("to");
        if (f && t && ISO.test(f) && ISO.test(t) && f <= t) {
          from = f;
          to = t;
        } else from = addDays(latest, -29);
        break;
      }
      default: from = addDays(latest, -29);
    }
  }

  const periodParam = params.get("period") as Period | null;
  const periodIsAuto = !periodParam || !["day", "week", "month"].includes(periodParam);
  const period = periodIsAuto ? (from ? autoPeriod(from, to) : "day") : periodParam!;

  const update = useCallback(
    (patch: Record<string, string | null>) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      }, { replace: true }),
    [setParams],
  );

  return {
    ready: Boolean(latest),
    from, to, period, periodIsAuto, preset: preset in { latest: 1, "7d": 1, "30d": 1, "90d": 1, mtd: 1, all: 1, custom: 1 } ? preset : "30d",
    latest, earliest,
    days: from ? daysInclusive(from, to) : 0,
    setPreset: (p) => update({ range: p, from: null, to: null }),
    setCustom: (f, t) => update({ range: "custom", from: f, to: t }),
    setPeriod: (p) => update({ period: p === "auto" ? null : p }),
  };
}

/** The equal-length window immediately before [from, to], for deltas. */
export function previousWindow(from: string, to: string) {
  const n = daysInclusive(from, to);
  return { from: addDays(from, -n), to: addDays(from, -1) };
}
