import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import type { Summary } from "@evsa/core";
import { cn } from "../lib/cn";
import { compact, int, pct, pp } from "../lib/format";
import { InfoTip } from "./ui/tooltip";

interface Tile {
  label: string;
  definition: ReactNode;
  value: string;
  sub: ReactNode;
  delta?: { value: number; upIsGood: boolean; isRate: boolean } | null;
}

function Delta({ d, versus }: { d: NonNullable<Tile["delta"]>; versus: string }) {
  const flat = Math.abs(d.value) < (d.isRate ? 0.00005 : 0.5);
  const good = flat ? null : (d.value > 0) === d.upIsGood;
  const Icon = flat ? Minus : d.value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs", good === null ? "text-ink-3" : good ? "text-good" : "text-bad")} title={`vs ${versus}`}>
      <Icon className="size-3.5" />
      <span className="num">{d.isRate ? pp(d.value) : `${d.value > 0 ? "+" : ""}${int(d.value)}`}</span>
    </span>
  );
}

export function KpiStrip({ s, prev, versus }: { s: Summary; prev: Summary | null; versus: string }) {
  const tiles: Tile[] = [
    {
      label: "Total transactions",
      definition: "Every row in the uploaded files for the selected range.",
      value: int(s.total),
      sub: <>{compact(s.success)} success · {compact(s.failed)} failed</>,
      delta: null,
    },
    {
      label: "Success rate",
      definition: "Transactions stopped with Day_Pin ÷ total transactions.",
      value: pct(s.rates.success),
      sub: <>{int(s.success)} transactions</>,
      delta: prev && { value: s.rates.success - prev.rates.success, upIsGood: true, isRate: true },
    },
    {
      label: "Failed rate",
      definition: "Every transaction not stopped with Day_Pin ÷ total transactions. Includes unclassified.",
      value: pct(s.rates.failed),
      sub: <>{int(s.failed)} transactions</>,
      delta: prev && { value: s.rates.failed - prev.rates.failed, upIsGood: false, isRate: true },
    },
    {
      label: "Failed EVCS related rate",
      definition: "Transactions classified EVCS Fault ÷ total transactions. Charger-side failures.",
      value: pct(s.rates.evcs),
      sub: <>{int(s.evcs)} transactions</>,
      delta: prev && { value: s.rates.evcs - prev.rates.evcs, upIsGood: false, isRate: true },
    },
    {
      label: "Failed Non-EVCS related rate",
      definition: "Transactions classified Non-EVCS Fault ÷ total transactions. Emergency stops, unpaid sessions, vehicle-side stops.",
      value: pct(s.rates.nonEvcs),
      sub: <>{int(s.nonEvcs)} transactions</>,
      delta: prev && { value: s.rates.nonEvcs - prev.rates.nonEvcs, upIsGood: false, isRate: true },
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t, i) => (
        <div key={t.label} className={cn("bg-panel px-4 py-3.5", i === 0 && "col-span-2 md:col-span-1")}>
          <div className="flex items-center gap-1.5 text-xs text-ink-2">
            {t.label}
            <InfoTip content={t.definition} />
          </div>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-[22px] leading-none font-semibold tracking-[-0.01em] text-ink">{t.value}</span>
            {t.delta && <Delta d={t.delta} versus={versus} />}
          </div>
          <div className="mt-1.5 text-xs text-ink-3">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}
