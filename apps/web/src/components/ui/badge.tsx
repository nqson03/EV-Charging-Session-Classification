import type { ReactNode } from "react";
import { Category } from "@evsa/core";
import { cn } from "../../lib/cn";
import { KPI_COLORS } from "../../lib/colors";

type Tone = "neutral" | "accent" | "warn" | "good" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-panel-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  warn: "bg-warn-bg text-warn-ink border-warn-line",
  good: "bg-panel-2 text-good border-line",
  danger: "bg-panel-2 text-danger border-line",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-[4px] border px-1.5 text-2xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

const CATEGORY_COLOR: Record<string, string> = {
  [Category.EvcsFault]: KPI_COLORS.evcs,
  [Category.NonEvcsFault]: KPI_COLORS.nonEvcs,
  [Category.Success]: "var(--ink-3)",
  [Category.Unclassified]: "var(--warn-line)",
};

/** Category label with a colour key beside it. The text itself stays in ink. */
export function CategoryTag({ category }: { category: string }) {
  if (category === Category.Unclassified) return <Badge tone="warn">Unclassified</Badge>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-2">
      <Dot color={CATEGORY_COLOR[category] ?? "var(--ink-3)"} />
      {category}
    </span>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-xs text-ink-2">{children}</code>;
}
