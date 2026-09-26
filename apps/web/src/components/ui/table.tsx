import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "../../lib/cn";

export function Table({ className, ...p }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px]", className)} {...p} />
    </div>
  );
}

export function TH({ className, align = "left", ...p }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "h-8 border-y border-line bg-panel-2 px-4 text-2xs font-medium tracking-wide text-ink-3 uppercase first:pl-4 whitespace-nowrap",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      {...p}
    />
  );
}

export function SortTH<K extends string>({
  children, sortKey, sort, onSort, align = "left", className,
}: {
  children: ReactNode; sortKey: K; sort: { key: K; dir: "asc" | "desc" }; onSort: (k: K) => void;
  align?: "left" | "right"; className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <TH align={align} className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 uppercase hover:text-ink", active && "text-ink", align === "right" && "flex-row-reverse")}
      >
        {children}
        {active ? (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <span className="size-3" />}
      </button>
    </TH>
  );
}

export function TR({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-line last:border-b-0 hover:bg-panel-2/60", className)} {...p} />;
}

export function TD({ className, align = "left", ...p }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" }) {
  return <td className={cn("h-9 px-4 align-middle", align === "right" && "text-right num", className)} {...p} />;
}
