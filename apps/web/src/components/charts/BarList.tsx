import type { ReactNode } from "react";

export interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  display: ReactNode;
  secondary?: ReactNode;
  color: string;
}

/** Ranked horizontal bars. Thin marks, rounded data-end, value at the tip in ink. */
export function BarList({ items, max }: { items: BarItem[]; max?: number }) {
  const m = max ?? Math.max(Number.EPSILON, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink">{i.label}</span>
            <span className="num shrink-0 text-ink">
              {i.display}
              {i.secondary && <span className="ml-2 text-ink-3">{i.secondary}</span>}
            </span>
          </div>
          <div className="h-2 w-full">
            <div
              className="h-2 rounded-r-[4px]"
              style={{ width: `${Math.max(0.5, (i.value / m) * 100)}%`, background: i.color }}
              title={typeof i.label === "string" ? i.label : undefined}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
