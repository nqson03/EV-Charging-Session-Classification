import { useMemo } from "react";
import { summarizeClassified } from "@evsa/core";
import { useMetaQuery, useReportQuery } from "./api";
import { previousWindow, useFilters } from "./filters";

/** Meta + global filters + the report for the selected range and the one before it. */
export function useDashboard() {
  const metaQ = useMetaQuery();
  const f = useFilters(metaQ.data);
  const reportQ = useReportQuery({ from: f.from, to: f.to, period: f.period }, { skip: !f.ready });
  const prev = f.ready ? previousWindow(f.from, f.to) : null;
  const hasPrev = Boolean(prev && f.earliest && prev.to >= f.earliest);
  const prevQ = useReportQuery(
    { from: prev?.from ?? "", to: prev?.to ?? "", period: "month" },
    { skip: !hasPrev },
  );
  const summary = useMemo(() => (reportQ.data ? summarizeClassified(reportQ.data.rows) : null), [reportQ.data]);
  const prevSummary = useMemo(() => {
    const s = hasPrev && prevQ.data ? summarizeClassified(prevQ.data.rows) : null;
    return s && s.total > 0 ? s : null;
  }, [hasPrev, prevQ.data]);
  return { metaQ, f, reportQ, summary, prevSummary, prevRange: hasPrev ? prev : null };
}
