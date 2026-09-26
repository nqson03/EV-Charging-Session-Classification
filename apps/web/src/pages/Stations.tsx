import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { stationStats, type StationStat } from "@evsa/core";
import { ErrorPage, LoadingPage, NoData } from "../components/common";
import { Button } from "../components/ui/button";
import { Callout } from "../components/ui/callout";
import { Input, Select } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { SortTH, Table, TD, TH, TR } from "../components/ui/table";
import { Page, PageHeader } from "../layout/PageHeader";
import { errorMessage, useStationsQuery } from "../lib/api";
import { KPI_COLORS } from "../lib/colors";
import { addDays, daysInclusive } from "../lib/dates";
import { useDashboard } from "../lib/dashboard";
import { day, int, pct } from "../lib/format";

const MAX_DAYS = 92;
const PAGE = 50;

type SortKey = "station" | "total" | "evcs" | "evcsRate" | "failedRate";
type Sort = { key: SortKey; dir: "asc" | "desc" };

function sortBy<T extends Record<string, unknown>>(rows: T[], key: keyof T, dir: "asc" | "desc") {
  return [...rows].sort((a, b) => {
    const va = a[key], vb = b[key];
    const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return dir === "asc" ? c : -c;
  });
}

function RateBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center justify-end gap-2.5">
      <div className="h-1.5 w-16">
        <div className="ml-auto h-1.5 rounded-l-[3px]" style={{ width: `${Math.min(100, (value / Math.max(max, 1e-9)) * 100)}%`, background: color }} />
      </div>
      <span className="num w-[52px]">{pct(value)}</span>
    </div>
  );
}

function downloadCsv(rows: StationStat[], from: string, to: string) {
  const head = ["station", "region", "transactions", "evcs_faults", "evcs_rate", "non_evcs_faults", "failed_rate", "top_evcs_reason"];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = rows.map((r) =>
    [r.station, r.region, r.total, r.evcs, pct(r.evcsRate), r.nonEvcs, pct(r.failedRate), r.topEvcs?.label ?? ""].map((v) => esc(String(v))).join(","),
  );
  const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `stations_${from}_${to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function StationsPage() {
  const { metaQ, f } = useDashboard();
  const clamped = f.ready && daysInclusive(f.from, f.to) > MAX_DAYS;
  const from = clamped ? addDays(f.to, -(MAX_DAYS - 1)) : f.from;
  const q = useStationsQuery({ from, to: f.to }, { skip: !f.ready });

  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [minSessions, setMinSessions] = useState(20);
  const [sort, setSort] = useState<Sort>({ key: "evcsRate", dir: "desc" });
  const [regionSort, setRegionSort] = useState<{ key: "region" | "stations" | "total" | "evcsRate" | "failedRate"; dir: "asc" | "desc" }>({ key: "total", dir: "desc" });
  const [page, setPage] = useState(0);

  const stats = useMemo(() => (q.data ? stationStats(q.data.rows) : []), [q.data]);
  const regions = useMemo(() => {
    const m = new Map<string, { region: string; stations: number; total: number; evcs: number; failed: number }>();
    for (const s of stats) {
      const e = m.get(s.region) ?? { region: s.region, stations: 0, total: 0, evcs: 0, failed: 0 };
      e.stations++;
      e.total += s.total;
      e.evcs += s.evcs;
      e.failed += s.evcs + s.nonEvcs + s.unclassified;
      m.set(s.region, e);
    }
    return [...m.values()].map((r) => ({ ...r, evcsRate: r.evcs / Math.max(1, r.total), failedRate: r.failed / Math.max(1, r.total) }));
  }, [stats]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = stats.filter(
      (s) => s.total >= minSessions && (!region || s.region === region) && (!needle || s.station.toLowerCase().includes(needle)),
    );
    return sortBy(list as unknown as Record<string, unknown>[], sort.key, sort.dir) as unknown as StationStat[];
  }, [stats, search, region, minSessions, sort]);

  if (metaQ.isError) return <ErrorPage message={errorMessage(metaQ.error)} />;
  if (metaQ.data && !f.ready) return <NoData />;

  const onSort = (key: SortKey) => {
    setPage(0);
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : key === "station" ? "asc" : "desc" }));
  };
  const onRegionSort = (key: typeof regionSort.key) =>
    setRegionSort((s) => ({ key, dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : key === "region" ? "asc" : "desc" }));

  const maxEvcsRate = Math.max(0, ...filtered.map((s) => s.evcsRate));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const regionRows = sortBy(regions, regionSort.key, regionSort.dir);
  const maxRegionRate = Math.max(0, ...regions.map((r) => r.evcsRate));
  const hidden = stats.filter((s) => s.total < minSessions).length;

  return (
    <>
      <PageHeader
        title="Stations"
        subtitle={q.data ? `${from === f.to ? day(from) : `${day(from)} – ${day(f.to)}`} · ${int(stats.length)} stations · ${int(regions.length)} regions` : " "}
        filters={f}
        showPeriod={false}
      />
      {q.isError ? (
        <ErrorPage message={errorMessage(q.error)} />
      ) : !q.data ? (
        <LoadingPage />
      ) : (
        <Page>
          {clamped && (
            <Callout title={`Station view covers up to ${MAX_DAYS} days`}>
              Showing the last {MAX_DAYS} days of the selected range, {day(from)} – {day(f.to)}.
            </Callout>
          )}

          <div className="space-y-4">
            <Panel title="By region" description="Region code from the station ID (C.HNO… → HNO) · click a row to filter the station list" bodyClassName="pb-0">
              <div className="max-h-[330px] overflow-y-auto">
                <Table>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <SortTH sortKey="region" sort={regionSort} onSort={onRegionSort}>Region</SortTH>
                      <SortTH sortKey="stations" sort={regionSort} onSort={onRegionSort} align="right">Stations</SortTH>
                      <SortTH sortKey="total" sort={regionSort} onSort={onRegionSort} align="right">Transactions</SortTH>
                      <SortTH sortKey="evcsRate" sort={regionSort} onSort={onRegionSort} align="right">EVCS rate</SortTH>
                      <SortTH sortKey="failedRate" sort={regionSort} onSort={onRegionSort} align="right">Failed rate</SortTH>
                    </tr>
                  </thead>
                  <tbody>
                    {regionRows.map((r) => (
                      <TR key={r.region} className="cursor-pointer" onClick={() => { setRegion(region === r.region ? "" : r.region); setPage(0); }}>
                        <TD className={region === r.region ? "font-semibold" : "font-medium"}>
                          <span className="font-mono text-xs">{r.region}</span>
                        </TD>
                        <TD align="right">{int(r.stations)}</TD>
                        <TD align="right">{int(r.total)}</TD>
                        <TD align="right"><RateBar value={r.evcsRate} max={maxRegionRate} color={KPI_COLORS.evcs} /></TD>
                        <TD align="right" className="text-ink-2">{pct(r.failedRate)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Panel>

            <Panel
              title="Stations"
              description={`Ranked by EVCS related rate · stations with fewer than ${minSessions} transactions hidden (${int(hidden)})`}
              actions={
                <Button size="sm" onClick={() => downloadCsv(filtered, from, f.to)} disabled={!filtered.length}>
                  <Download /> CSV
                </Button>
              }
              bodyClassName="pb-0"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
                  <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search station ID" className="pl-8" aria-label="Search station ID" />
                </div>
                <Select value={region} onChange={(e) => { setRegion(e.target.value); setPage(0); }} className="w-36" aria-label="Region">
                  <option value="">All regions</option>
                  {[...regions].sort((a, b) => a.region.localeCompare(b.region)).map((r) => (
                    <option key={r.region} value={r.region}>{r.region}</option>
                  ))}
                </Select>
                <Select value={String(minSessions)} onChange={(e) => { setMinSessions(Number(e.target.value)); setPage(0); }} className="w-44" aria-label="Minimum transactions">
                  {[1, 10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>Min. {n} transaction{n === 1 ? "" : "s"}</option>
                  ))}
                </Select>
              </div>
              <Table>
                <thead>
                  <tr>
                    <SortTH sortKey="station" sort={sort} onSort={onSort}>Station</SortTH>
                    <SortTH sortKey="total" sort={sort} onSort={onSort} align="right">Transactions</SortTH>
                    <SortTH sortKey="evcs" sort={sort} onSort={onSort} align="right">EVCS faults</SortTH>
                    <SortTH sortKey="evcsRate" sort={sort} onSort={onSort} align="right">EVCS rate</SortTH>
                    <SortTH sortKey="failedRate" sort={sort} onSort={onSort} align="right">Failed rate</SortTH>
                    <TH>Top EVCS reason</TH>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s) => (
                    <TR key={s.station}>
                      <TD className="whitespace-nowrap"><span className="font-mono text-xs">{s.station}</span></TD>
                      <TD align="right">{int(s.total)}</TD>
                      <TD align="right">{int(s.evcs)}</TD>
                      <TD align="right"><RateBar value={s.evcsRate} max={maxEvcsRate} color={KPI_COLORS.evcs} /></TD>
                      <TD align="right" className="text-ink-2">{pct(s.failedRate)}</TD>
                      <TD className="whitespace-nowrap text-ink-2">{s.topEvcs ? <>{s.topEvcs.label} <span className="num text-ink-3">({int(s.topEvcs.count)})</span></> : "—"}</TD>
                    </TR>
                  ))}
                  {!pageRows.length && (
                    <tr><td colSpan={6} className="py-10 text-center text-[13px] text-ink-3">No stations match these filters.</td></tr>
                  )}
                </tbody>
              </Table>
              <div className="-mx-4 flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-ink-3">
                <span className="num">
                  {filtered.length ? `${int(page * PAGE + 1)}–${int(Math.min(filtered.length, (page + 1) * PAGE))} of ${int(filtered.length)}` : "0 stations"}
                </span>
                <div className="flex gap-1.5">
                  <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </Panel>
          </div>
        </Page>
      )}
    </>
  );
}
