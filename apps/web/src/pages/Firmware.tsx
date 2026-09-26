import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  firmwareIndex, summarizeClassified, type ChargerModel, type FirmwareDim, type Generation, type ReportRow, type Summary,
} from "@evsa/core";
import { Legend, TrendChart, type TrendSeries } from "../components/charts/TrendChart";
import { ErrorPage, LoadingPage, NoData } from "../components/common";
import { Badge, Code, Dot } from "../components/ui/badge";
import { Panel } from "../components/ui/panel";
import { SortTH, Table, TD, TH, TR } from "../components/ui/table";
import { Page, PageHeader } from "../layout/PageHeader";
import { errorMessage } from "../lib/api";
import { GENERATION_COLORS } from "../lib/colors";
import { useDashboard } from "../lib/dashboard";
import { day, int, pct } from "../lib/format";
import { rangeSubtitle } from "./Overview";

const MODELS: ChargerModel[] = ["Core", "Kern", "AC"];
const GEN_LABEL: Record<Generation, string> = { old: "Old firmware", new: "New firmware", unknown: "Unknown" };

const buildDate = (yymmdd: string) => day(`20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`);

function group(rows: ReportRow[], key: (r: ReportRow) => string) {
  const m = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const k = key(r);
    const l = m.get(k);
    if (l) l.push(r);
    else m.set(k, [r]);
  }
  return m;
}

type VersionSort = "firmware" | "sessions" | "evcs" | "failed";

function VersionTable({ dims, rows }: { dims: FirmwareDim[]; rows: ReportRow[] }) {
  const [sort, setSort] = useState<{ key: VersionSort; dir: "asc" | "desc" }>({ key: "sessions", dir: "desc" });
  const byFw = useMemo(() => group(rows, (r) => r.fw), [rows]);
  const list = useMemo(() => {
    const items = dims.map((d) => ({ d, s: summarizeClassified(byFw.get(d.firmware) ?? []) })).filter((x) => x.s.total > 0);
    const val = (x: (typeof items)[number]) =>
      sort.key === "firmware" ? x.d.firmware : sort.key === "sessions" ? x.s.total : sort.key === "evcs" ? x.s.rates.evcs : x.s.rates.failed;
    return items.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.dir === "asc" ? c : -c;
    });
  }, [dims, byFw, sort]);
  const onSort = (key: VersionSort) =>
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : key === "firmware" ? "asc" : "desc" }));

  return (
    <Table>
      <thead>
        <tr>
          <SortTH sortKey="firmware" sort={sort} onSort={onSort}>Firmware version</SortTH>
          <TH>Build</TH>
          <TH>Line</TH>
          <TH>Model</TH>
          <TH align="right">Rated kW</TH>
          <SortTH sortKey="sessions" sort={sort} onSort={onSort} align="right">Transactions</SortTH>
          <SortTH sortKey="failed" sort={sort} onSort={onSort} align="right">Failed rate</SortTH>
          <SortTH sortKey="evcs" sort={sort} onSort={onSort} align="right">EVCS rate</SortTH>
        </tr>
      </thead>
      <tbody>
        {list.map(({ d, s }) => (
          <TR key={d.firmware}>
            <TD><Code>{d.firmware}</Code></TD>
            <TD className="num text-ink-2">{d.build ? buildDate(d.build) : "—"}</TD>
            <TD>
              <span className="inline-flex items-center gap-1.5 text-ink-2">
                <Dot color={GENERATION_COLORS[d.generation]} />
                {GEN_LABEL[d.generation]}
                {d.manual && <Badge>manual</Badge>}
              </span>
            </TD>
            <TD className="text-ink-2">{d.model}</TD>
            <TD align="right" className="text-ink-2">{d.ratingKw ?? "—"}</TD>
            <TD align="right">{int(s.total)}</TD>
            <TD align="right">{pct(s.rates.failed)}</TD>
            <TD align="right" className="font-medium">{pct(s.rates.evcs)}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

export function FirmwarePage() {
  const { metaQ, f, reportQ, summary: s } = useDashboard();
  const r = reportQ.data;

  const view = useMemo(() => {
    if (!r) return null;
    const seg = firmwareIndex(r.firmware);
    const key = (row: ReportRow) => seg(row.fw);
    const periods = [...new Set(r.rows.map((x) => x.p))].sort();
    const cell = new Map<string, ReportRow[]>();
    for (const row of r.rows) {
      const k = key(row);
      for (const kk of [`${row.p}|${k.generation}|*`, `${row.p}|${k.generation}|${k.model}`, `${row.p}|*|*`]) {
        const l = cell.get(kk);
        if (l) l.push(row);
        else cell.set(kk, [row]);
      }
    }
    const rate = (p: string, g: string, m: string, pick: (s: Summary) => number) => {
      const rows = cell.get(`${p}|${g}|${m}`);
      return rows ? pick(summarizeClassified(rows)) : null;
    };
    const overall = periods.map((p) => ({
      p,
      total: rate(p, "*", "*", (x) => x.total) ?? 0,
      failed: rate(p, "*", "*", (x) => x.rates.failed) ?? 0,
      old: rate(p, "old", "*", (x) => x.rates.evcs) ?? 0,
      new: rate(p, "new", "*", (x) => x.rates.evcs) ?? 0,
    }));
    const byModel = MODELS.map((m) => ({
      model: m,
      has: r.rows.some((row) => key(row).model === m),
      data: periods.map((p) => ({
        p,
        old: rate(p, "old", m, (x) => x.rates.evcs) ?? 0,
        new: rate(p, "new", m, (x) => x.rates.evcs) ?? 0,
      })),
    }));
    const segs = [...group(r.rows, (row) => `${key(row).generation}|${key(row).model}`).entries()]
      .map(([k, rows]) => {
        const [generation, model] = k.split("|") as [Generation, ChargerModel];
        return { generation, model, s: summarizeClassified(rows) };
      })
      .sort((a, b) => (a.generation === b.generation ? MODELS.indexOf(a.model) - MODELS.indexOf(b.model) : a.generation === "old" ? -1 : 1));
    return { overall, byModel, segs };
  }, [r]);

  if (metaQ.isError) return <ErrorPage message={errorMessage(metaQ.error)} />;
  if (metaQ.data && !f.ready) return <NoData />;

  const cutoff = metaQ.data?.newFirmwareFrom ?? "260421";
  const overallSeries: TrendSeries[] = [
    // Blue stays "new firmware" on every chart of this page, so total failed is drawn in neutral ink.
    { key: "failed", label: "Total failed", color: "var(--ink-3)" },
    { key: "old", label: "EVCS related · old firmware", color: GENERATION_COLORS.old },
    { key: "new", label: "EVCS related · new firmware", color: GENERATION_COLORS.new },
  ];
  const modelSeries: TrendSeries[] = [
    { key: "old", label: "Old firmware", color: GENERATION_COLORS.old },
    { key: "new", label: "New firmware", color: GENERATION_COLORS.new },
  ];

  return (
    <>
      <PageHeader
        title="Firmware & models"
        subtitle={r && s ? rangeSubtitle(f.from, f.to, f.days, r.dates, s.total) : " "}
        filters={f}
      />
      {reportQ.isError ? (
        <ErrorPage message={errorMessage(reportQ.error)} />
      ) : !r || !s || !view ? (
        <LoadingPage />
      ) : (
        <Page>
          <Panel
            title="Failure rate by firmware line"
            description={`Total failed vs EVCS related rate on old and new firmware · new = builds from ${buildDate(cutoff)} (${cutoff})`}
            actions={<Legend series={overallSeries} />}
          >
            <TrendChart data={view.overall} series={overallSeries} period={f.period} height={250} />
          </Panel>

          <div className="grid gap-4 md:grid-cols-3">
            {view.byModel.map((m) => (
              <Panel key={m.model} title={m.model} description="EVCS related rate · old vs new firmware">
                {m.has ? (
                  <div className="space-y-3">
                    <Legend series={modelSeries} />
                    <TrendChart data={m.data} series={modelSeries} period={f.period} height={190} />
                  </div>
                ) : (
                  <p className="py-6 text-center text-xs text-ink-3">No {m.model} chargers in this range.</p>
                )}
              </Panel>
            ))}
          </div>

          <Panel title="Segments" description="Firmware line × charger model" bodyClassName="pb-0">
            <Table>
              <thead>
                <tr>
                  <TH>Firmware line</TH>
                  <TH>Model</TH>
                  <TH align="right">Transactions</TH>
                  <TH align="right">Failed rate</TH>
                  <TH align="right">EVCS rate</TH>
                  <TH align="right">Non-EVCS rate</TH>
                  <TH>Top EVCS reason</TH>
                </tr>
              </thead>
              <tbody>
                {view.segs.map(({ generation, model, s: x }) => (
                  <TR key={`${generation}-${model}`}>
                    <TD>
                      <span className="inline-flex items-center gap-1.5">
                        <Dot color={GENERATION_COLORS[generation]} />
                        {GEN_LABEL[generation]}
                      </span>
                    </TD>
                    <TD>{model}</TD>
                    <TD align="right">{int(x.total)}</TD>
                    <TD align="right">{pct(x.rates.failed)}</TD>
                    <TD align="right" className="font-medium">{pct(x.rates.evcs)}</TD>
                    <TD align="right">{pct(x.rates.nonEvcs)}</TD>
                    <TD className="text-ink-2">
                      {x.evcsReasons[0] ? `${x.evcsReasons[0].label} · ${pct(x.evcsReasons[0].count / Math.max(1, x.evcs))} of EVCS` : "—"}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel
            title="Firmware versions"
            description={<>Line and model are read from the version string. Adjust them under <Link to="/rules#firmware" className="text-accent-ink hover:underline">Classification rules</Link>.</>}
            bodyClassName="pb-0"
          >
            <VersionTable dims={r.firmware} rows={r.rows} />
          </Panel>
        </Page>
      )}
    </>
  );
}
