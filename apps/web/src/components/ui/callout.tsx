import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "../../lib/cn";

export function Callout({
  tone = "info", title, children, action, className,
}: { tone?: "info" | "warn"; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div
      role={tone === "warn" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-md border px-3.5 py-2.5",
        tone === "warn" ? "border-warn-line bg-warn-bg text-warn-ink" : "border-line bg-panel text-ink-2",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 text-[13px]">
        <div className={cn("font-medium", tone === "info" && "text-ink")}>{title}</div>
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
