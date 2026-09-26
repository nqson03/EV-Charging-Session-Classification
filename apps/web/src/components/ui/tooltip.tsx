import * as T from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

export const TooltipProvider = T.Provider;

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <T.Root delayDuration={150}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={6}
          className="z-50 max-w-[280px] rounded-[5px] bg-ink px-2.5 py-1.5 text-xs leading-snug text-panel shadow-md"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/** Small (i) next to a label, for definitions. */
export function InfoTip({ content, label = "More information" }: { content: ReactNode; label?: string }) {
  return (
    <Tip content={content}>
      <button type="button" aria-label={label} className="inline-flex text-ink-3 hover:text-ink-2">
        <Info className="size-3.5" />
      </button>
    </Tip>
  );
}
