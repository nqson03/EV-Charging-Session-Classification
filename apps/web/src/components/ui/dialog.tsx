import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Dialog({
  open, onOpenChange, title, description, children, footer, width = "md",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md";
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60" />
        <D.Content
          className={cn(
            "fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-32px)] -translate-x-1/2 rounded-md border border-line bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.18)]",
            width === "sm" ? "max-w-[420px]" : "max-w-[560px]",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div>
              <D.Title className="text-sm font-semibold">{title}</D.Title>
              {description ? (
                <D.Description className="mt-0.5 text-xs text-ink-3">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>
              )}
            </div>
            <D.Close className="rounded p-1 text-ink-3 hover:bg-panel-2 hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          {children && <div className="px-5 py-4">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
