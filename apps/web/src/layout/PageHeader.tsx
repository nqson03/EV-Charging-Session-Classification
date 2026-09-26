import type { ReactNode } from "react";
import { Segmented } from "../components/ui/segmented";
import { DateRange } from "../components/ui/date-range";
import { PERIODS, type Filters } from "../lib/filters";

export function PageHeader({
  title, subtitle, filters, showPeriod = true, actions,
}: { title: string; subtitle?: ReactNode; filters?: Filters; showPeriod?: boolean; actions?: ReactNode }) {
  return (
    <div className="z-20 border-b border-line bg-page/95 backdrop-blur supports-[backdrop-filter]:bg-page/80 lg:sticky lg:top-0">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-[-0.005em]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {filters?.ready && showPeriod && (
            <Segmented
              label="Granularity"
              value={filters.period}
              onChange={(p) => filters.setPeriod(p)}
              options={PERIODS}
            />
          )}
          {filters?.ready && <DateRange f={filters} />}
        </div>
      </div>
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1320px] space-y-4 px-4 py-5 sm:px-6">{children}</div>;
}
