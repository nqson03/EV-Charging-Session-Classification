import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Panel({
  title, description, actions, children, className, bodyClassName, footer,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
}) {
  return (
    <section className={cn("rounded-md border border-line bg-panel", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-3.5 pb-3">
          <div className="min-w-0 flex-1 basis-[220px]">
            {title && <h2 className="text-[13px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("px-4 pb-4", !title && !actions && "pt-4", bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-line px-4 py-2.5 text-xs text-ink-3">{footer}</footer>}
    </section>
  );
}
