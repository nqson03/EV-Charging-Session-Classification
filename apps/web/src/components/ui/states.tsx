import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-panel-2", className)} />;
}

export function EmptyState({
  title, children, action, icon, className,
}: { title: ReactNode; children?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 text-ink-3 [&_svg]:size-5">{icon}</div>}
      <div className="text-[13px] font-medium text-ink">{title}</div>
      {children && <div className="mt-1 max-w-sm text-xs text-ink-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-line bg-panel px-4 py-3 text-[13px] text-danger">{children}</div>;
}
