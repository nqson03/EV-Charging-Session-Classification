import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { Period } from "@evsa/core";
import { periodLabel, pct } from "../../lib/format";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

export type TrendDatum = { p: string } & Record<string, number | string>;

const UNIT: Record<Period, string> = { day: "day", week: "week", month: "month" };

export function Legend({ series }: { series: TrendSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-[2px] w-3.5 rounded-full" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function TrendTooltip({ active, payload, label, series, period }: TooltipContentProps & { series: TrendSeries[]; period: Period }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload as TrendDatum;
  return (
    <div className="min-w-[200px] rounded-[5px] border border-line bg-panel px-3 py-2 text-xs shadow-[0_6px_20px_rgba(0,0,0,0.12)]">
      <div className="mb-1.5 font-medium text-ink">{periodLabel(String(label), period, true)}</div>
      {series.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <span className="inline-block h-[2px] w-3 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="num font-medium text-ink">{pct(Number(row[s.key] ?? 0))}</span>
        </div>
      ))}
      {typeof row.total === "number" && (
        <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 text-ink-3">
          <span>Transactions</span>
          <span className="num">{row.total.toLocaleString("en-US")}</span>
        </div>
      )}
    </div>
  );
}

/** When the range holds one period, a line has nothing to connect: show the values plainly. */
function Snapshot({ datum, series, period }: { datum: TrendDatum; series: TrendSeries[]; period: Period }) {
  return (
    <div>
      <div className="grid gap-px overflow-hidden rounded-[5px] border border-line bg-line" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0,1fr))` }}>
        {series.map((s) => (
          <div key={s.key} className="bg-panel px-3 py-3">
            <div className="flex items-center gap-1.5 text-xs text-ink-2">
              <span aria-hidden className="inline-block h-[2px] w-3 rounded-full" style={{ background: s.color }} />
              {s.label}
            </div>
            <div className="mt-1 text-lg font-semibold text-ink">{pct(Number(datum[s.key] ?? 0))}</div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-ink-3">
        {periodLabel(datum.p, period, true)} is the only {UNIT[period]} with data in this range. The trend line
        appears once two or more {UNIT[period]}s are uploaded.
      </p>
    </div>
  );
}

export function TrendChart({
  data, series, period, height = 240,
}: { data: TrendDatum[]; series: TrendSeries[]; period: Period; height?: number }) {
  if (data.length === 0) return null;
  if (data.length === 1) return <Snapshot datum={data[0]!} series={series} period={period} />;

  const last = data[data.length - 1]!;
  const max = Math.max(0.0001, ...data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0))));
  // Direct end labels only where they separate; otherwise the legend + tooltip carry identity.
  const ends = series.map((s) => ({ key: s.key, v: Number(last[s.key] ?? 0) }));
  const labelled = new Set(
    ends.filter((e) => ends.every((o) => o.key === e.key || Math.abs(o.v - e.v) / max > 0.08)).map((e) => e.key),
  );
  const showDots = data.length <= 16;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 60, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="p"
            tickFormatter={(v: string) => periodLabel(v, period)}
            tickLine={false}
            axisLine={{ stroke: "var(--axis)" }}
            minTickGap={28}
            tickMargin={8}
          />
          <YAxis
            tickFormatter={(v: number) => pct(v)}
            tickLine={false}
            axisLine={false}
            width={58}
            domain={[0, "auto"]}
            tickCount={5}
          />
          <Tooltip
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            content={(p) => <TrendTooltip {...(p as TooltipContentProps)} series={series} period={period} />}
            isAnimationActive={false}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              type="linear"
              isAnimationActive={false}
              dot={showDots ? { r: 3, strokeWidth: 2, stroke: "var(--panel)", fill: s.color } : false}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--panel)", fill: s.color }}
              label={(props: { x?: number | string; y?: number | string; index?: number; value?: unknown }) =>
                props.index === data.length - 1 && labelled.has(s.key) ? (
                  <text x={Number(props.x) + 8} y={Number(props.y) + 4} fontSize={11} fill="var(--ink-2)" className="num">
                    {pct(Number(props.value))}
                  </text>
                ) : (
                  <g />
                )
              }
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
