import { useMemo } from "react";
import { byPeriod, evcsReasonRate, type ReasonStat } from "@evsa/core";
import { Legend, TrendChart } from "../components/charts/TrendChart";
import { ErrorPage, LoadingPage, NoData, UnclassifiedBanner } from "../components/common";
import { Code, Dot } from "../components/ui/badge";
import { Panel } from "../components/ui/panel";
import { Table, TD, TH, TR } from "../components/ui/table";
import { InfoTip } from "../components/ui/tooltip";
import { Page, PageHeader } from "../layout/PageHeader";
import { errorMessage } from "../lib/api";
import { KPI_COLORS, reasonColors } from "../lib/colors";
import { useDashboard } from "../lib/dashboard";
import { int, pct } from "../lib/format";
import { rangeSubtitle } from "./Overview";

function ReasonTable({ rows, denom, denomLabel, color }: { rows: ReasonStat[]; denom: number; denomLabel: string; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Table>
      <thead>
        <tr>
          <TH className="w-[90px]">Code</TH>
          <TH>Stop reason</TH>
          <TH align="right">Transactions</TH>
          <TH align="right">Rate</TH>
          <TH align="right" className="w-[34%]">{denomLabel}</TH>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <TR key={r.label}>
            <TD>{r.code ? <Code>{r.code}</Code> : <span className="text-ink-3">—</span>}</TD>
            <TD className="font-medium">{r.label}</TD>
            <TD align="right">{int(r.count)}</TD>
            <TD align="right">{pct(r.rate)}</TD>
            <TD align="right">
              <div className="flex items-center justify-end gap-3">
                <div className="h-1.5 w-full max-w-[220px]">
                  <div className="ml-auto h-1.5 rounded-l-[3px]" style={{ width: `${(r.count / max) * 100}%`, background: color }} />
                </div>
                <span className="num w-[60px] text-ink-2">{pct(r.count / Math.max(1, denom))}</span>
              </div>
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

export function ChargerFaultsPage() {
  const { metaQ, f, reportQ, summary: s } = useDashboard();
  const top3 = useMemo(() => s?.evcsReasons.slice(0, 3) ?? [], [s]);
  const colors = reasonColors(top3.map((t) => t.label));
  const series = top3.map((t) => ({ key: t.label, label: t.label, color: colors.get(t.label)! }));
  const trend = useMemo(
    () =>
      reportQ.data
        ? byPeriod(reportQ.data.rows).map(({ period, summary }) => ({
            p: period,
            total: summary.total,
            ...Object.fromEntries(top3.map((t) => [t.label, evcsReasonRate(summary, t.label)])),
          }))
        : [],
    [reportQ.data, top3],
  );

  if (metaQ.isError) return <ErrorPage message={errorMessage(metaQ.error)} />;
  if (metaQ.data && !f.ready) return <NoData />;
  const r = reportQ.data;

  return (
    <>
      <PageHeader
        title="Charger faults"
        subtitle={r && s ? rangeSubtitle(f.from, f.to, f.days, r.dates, s.total) : " "}
        filters={f}
      />
      {reportQ.isError ? (
        <ErrorPage message={errorMessage(reportQ.error)} />
      ) : !r || !s ? (
        <LoadingPage />
      ) : (
        <Page>
          <UnclassifiedBanner summary={s} />

          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-4">
            <div className="bg-panel px-4 py-3.5">
              <div className="flex items-center gap-1.5 text-xs text-ink-2">
                Failed EVCS related
                <InfoTip content="Transactions classified EVCS Fault. Top 3 and the trend below count these only (reporting rule since 12 Sep 2026)." />
              </div>
              <div className="mt-1.5 text-[22px] leading-none font-semibold">{pct(s.rates.evcs)}</div>
              <div className="mt-1.5 text-xs text-ink-3">{int(s.evcs)} of {int(s.total)} transactions</div>
            </div>
            {top3.map((t, i) => (
              <div key={t.label} className="bg-panel px-4 py-3.5">
                <div className="flex items-center gap-2 text-xs text-ink-2">
                  <Dot color={colors.get(t.label)!} />
                  <span className="num text-ink-3">#{i + 1}</span>
                  <span className="truncate font-medium text-ink">{t.label}</span>
                  {t.code && <Code>{t.code}</Code>}
                </div>
                <div className="mt-1.5 text-[22px] leading-none font-semibold">{pct(t.rate)}</div>
                <div className="mt-1.5 text-xs text-ink-3">
                  {int(t.count)} transactions · {pct(t.count / Math.max(1, s.evcs))} of EVCS faults
                </div>
              </div>
            ))}
            {Array.from({ length: Math.max(0, 3 - top3.length) }, (_, i) => (
              <div key={`empty-${i}`} className="bg-panel px-4 py-3.5 text-xs text-ink-3">—</div>
            ))}
          </div>

          <Panel
            title="Top 3 EVCS related stop reasons"
            description="Rate of all transactions per period · the three reasons ranked over the whole range"
            actions={<Legend series={series} />}
          >
            {series.length ? (
              <TrendChart data={trend} series={series} period={f.period} height={260} />
            ) : (
              <p className="text-[13px] text-ink-3">No EVCS related faults in this range.</p>
            )}
          </Panel>

          <Panel
            title="All EVCS related stop reasons"
            description={`${s.evcsReasons.length} reasons · ranked by transactions`}
            bodyClassName="pb-0"
          >
            <ReasonTable rows={s.evcsReasons} denom={s.evcs} denomLabel="Share of EVCS faults" color={KPI_COLORS.evcs} />
          </Panel>

          <Panel
            title="Non-EVCS related stop reasons"
            description="For context: not caused by the charger, never counted in the Top 3"
            bodyClassName="pb-0"
          >
            <ReasonTable rows={s.nonEvcsReasons} denom={s.nonEvcs} denomLabel="Share of Non-EVCS faults" color={KPI_COLORS.nonEvcs} />
          </Panel>
        </Page>
      )}
    </>
  );
}
