import { ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useMemo } from "react";
import { byPeriod, Category, type Summary } from "@evsa/core";
import { BarList } from "../components/charts/BarList";
import { Legend, TrendChart, type TrendSeries } from "../components/charts/TrendChart";
import { ErrorPage, LoadingPage, NoData, UnclassifiedBanner } from "../components/common";
import { KpiStrip } from "../components/KpiStrip";
import { Code, Dot } from "../components/ui/badge";
import { Panel } from "../components/ui/panel";
import { Table, TD, TH, TR } from "../components/ui/table";
import { Page, PageHeader } from "../layout/PageHeader";
import { errorMessage } from "../lib/api";
import { KPI_COLORS, reasonColors } from "../lib/colors";
import { useDashboard } from "../lib/dashboard";
import { day, int, pct, plural } from "../lib/format";

const TREND_SERIES: TrendSeries[] = [
  { key: "failed", label: "Total failed", color: KPI_COLORS.failed },
  { key: "evcs", label: "EVCS related", color: KPI_COLORS.evcs },
  { key: "nonEvcs", label: "Non-EVCS related", color: KPI_COLORS.nonEvcs },
];

export function rangeSubtitle(from: string, to: string, days: number, dates: string[], total: number) {
  const span = from === to ? day(from) : `${day(from)} – ${day(to)}`;
  const coverage = dates.length < days ? ` · ${dates.length} of ${plural(days, "day")} uploaded` : "";
  return `${span}${coverage} · ${int(total)} transactions`;
}

function SummaryStats({ s }: { s: Summary }) {
  const rows: [string, number, number | null][] = [
    ["Total Transactions", s.total, null],
    ["Total Success", s.success, s.rates.success],
    ["Total Failed", s.failed, s.rates.failed],
    ["Failed EVCS related", s.evcs, s.rates.evcs],
    ["Failed Non-EVCS related", s.nonEvcs, s.rates.nonEvcs],
  ];
  return (
    <Table>
      <thead>
        <tr>
          <TH>Metric</TH>
          <TH align="right">Count</TH>
          <TH align="right">Rate</TH>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, n, r]) => (
          <TR key={label}>
            <TD className={label === "Total Transactions" ? "font-medium whitespace-nowrap" : "whitespace-nowrap"}>{label}</TD>
            <TD align="right">{int(n)}</TD>
            <TD align="right" className="text-ink-2">{r === null ? "—" : pct(r)}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

function FailureMix({ s }: { s: Summary }) {
  const parts = [
    { key: "evcs", label: "EVCS related", n: s.evcs, color: KPI_COLORS.evcs },
    { key: "non", label: "Non-EVCS related", n: s.nonEvcs, color: KPI_COLORS.nonEvcs },
    ...(s.unclassified ? [{ key: "unc", label: "Unclassified", n: s.unclassified, color: "var(--warn-line)" }] : []),
  ];
  const failed = Math.max(1, s.failed);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px]" role="img" aria-label="Share of failed transactions by category">
        {parts.map((p, i) => (
          <div
            key={p.key}
            style={{ width: `${(p.n / failed) * 100}%`, background: p.color, minWidth: p.n ? 3 : 0 }}
            className={i === 0 ? "rounded-l-[4px]" : i === parts.length - 1 ? "rounded-r-[4px]" : ""}
            title={`${p.label}: ${int(p.n)}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center justify-between text-[13px]">
            <span className="inline-flex items-center gap-2 text-ink-2"><Dot color={p.color} />{p.label}</span>
            <span className="num text-ink">
              {int(p.n)} <span className="ml-2 inline-block w-[60px] text-right text-ink-3">{pct(p.n / failed)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-3">Share of failed transactions, not of all transactions.</p>
    </div>
  );
}

export function OverviewPage() {
  const { metaQ, f, reportQ, summary: s, prevSummary, prevRange } = useDashboard();
  const { search } = useLocation();
  const trend = useMemo(
    () =>
      reportQ.data
        ? byPeriod(reportQ.data.rows).map(({ period, summary }) => ({
            p: period, total: summary.total,
            failed: summary.rates.failed, evcs: summary.rates.evcs, nonEvcs: summary.rates.nonEvcs,
          }))
        : [],
    [reportQ.data],
  );

  if (metaQ.isError) return <ErrorPage message={errorMessage(metaQ.error)} />;
  if (metaQ.data && !f.ready) return <NoData />;

  const r = reportQ.data;
  const top3 = s?.evcsReasons.slice(0, 3) ?? [];
  const colors = reasonColors(top3.map((x) => x.label));
  const nonTop = s?.nonEvcsReasons.slice(0, 4) ?? [];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={r && s ? rangeSubtitle(f.from, f.to, f.days, r.dates, s.total) : " "}
        filters={f}
      />
      {reportQ.isError ? (
        <ErrorPage message={errorMessage(reportQ.error)} />
      ) : !r || !s ? (
        <LoadingPage />
      ) : s.total === 0 ? (
        <Page>
          <Panel><p className="py-8 text-center text-[13px] text-ink-3">No uploaded data in this range. Pick another range.</p></Panel>
        </Page>
      ) : (
        <Page>
          <UnclassifiedBanner summary={s} />
          <KpiStrip
            s={s}
            prev={prevSummary}
            versus={prevRange ? `${day(prevRange.from)} – ${day(prevRange.to)}` : ""}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Failure rate trend"
              description="Share of all transactions in each period"
              actions={<Legend series={TREND_SERIES} />}
            >
              <TrendChart data={trend} series={TREND_SERIES} period={f.period} height={260} />
            </Panel>

            <Panel
              title="Top 3 failed reasons"
              description="EVCS related faults only · rate of all transactions"
              footer={
                <Link to={{ pathname: "/charger-faults", search }} className="inline-flex items-center gap-1 text-accent-ink hover:underline">
                  All charger faults <ArrowRight className="size-3" />
                </Link>
              }
            >
              {top3.length ? (
                <BarList
                  items={top3.map((x, i) => ({
                    key: x.label,
                    label: (
                      <span className="inline-flex items-center gap-2">
                        <span className="num w-3 text-ink-3">{i + 1}</span>
                        {x.label}
                        {x.code && <Code>{x.code}</Code>}
                      </span>
                    ),
                    value: x.rate,
                    display: pct(x.rate),
                    secondary: int(x.count),
                    color: colors.get(x.label)!,
                  }))}
                />
              ) : (
                <p className="text-[13px] text-ink-3">No EVCS related faults in this range.</p>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Panel title="Summary stats" description="KPI table · unclassified transactions are not listed" bodyClassName="pb-0" className="lg:col-span-1">
              <SummaryStats s={s} />
            </Panel>
            <Panel title="Failure mix" description="Where failed transactions come from">
              <FailureMix s={s} />
            </Panel>
            <Panel title="Top Non-EVCS reasons" description="Not charger related · rate of all transactions">
              <BarList
                items={nonTop.map((x) => ({
                  key: x.label, label: x.label, value: x.count, display: pct(x.rate), secondary: int(x.count),
                  color: KPI_COLORS.nonEvcs,
                }))}
              />
              {s.nonEvcsReasons.length > 4 && (
                <p className="mt-3 text-xs text-ink-3">
                  + {s.nonEvcsReasons.length - 4} more ({int(s.nonEvcsReasons.slice(4).reduce((n, x) => n + x.count, 0))} transactions)
                </p>
              )}
            </Panel>
          </div>

          <p className="text-xs text-ink-3">
            Categories follow the three-step rule set: Day_Pin is {Category.Success}; an empty eMSP transaction ID is{" "}
            {Category.NonEvcsFault}; otherwise the stop reason is looked up in the <Link to="/rules" className="text-accent-ink hover:underline">mapping</Link>.
          </p>
        </Page>
      )}
    </>
  );
}
