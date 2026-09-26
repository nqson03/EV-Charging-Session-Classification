import * as P from "@radix-ui/react-popover";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { PRESETS, type Filters } from "../../lib/filters";
import { day } from "../../lib/format";
import { Button } from "./button";

export function DateRange({ f }: { f: Filters }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(f.from);
  const [to, setTo] = useState(f.to);
  const label = f.preset === "custom" ? "Custom" : PRESETS.find((p) => p.id === f.preset)?.label;

  return (
    <P.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setFrom(f.from);
          setTo(f.to);
        }
      }}
    >
      <P.Trigger asChild>
        <button className="inline-flex h-8 items-center gap-2 rounded-[5px] border border-line-strong bg-panel px-2.5 text-[13px] hover:bg-panel-2">
          <Calendar className="size-3.5 text-ink-3" />
          <span className="font-medium">{label}</span>
          <span className="num text-ink-3">
            {f.from === f.to ? day(f.from) : `${day(f.from)} – ${day(f.to)}`}
          </span>
          <ChevronDown className="size-3.5 text-ink-3" />
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content align="end" sideOffset={6} className="z-50 w-64 rounded-md border border-line bg-panel py-1 shadow-[0_8px_28px_rgba(0,0,0,0.14)]">
          <div className="px-3 pt-1.5 pb-1 eyebrow">Relative to latest upload</div>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                f.setPreset(p.id);
                setOpen(false);
              }}
              className={cn("flex h-8 w-full items-center justify-between px-3 text-left text-[13px] hover:bg-panel-2", f.preset === p.id && "font-semibold")}
            >
              {p.label}
              {f.preset === p.id && <Check className="size-4" strokeWidth={2.5} />}
            </button>
          ))}
          <div className="mt-1 border-t border-line px-3 pt-2.5 pb-2">
            <div className="mb-1.5 eyebrow">Custom range</div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={from} min={f.earliest ?? undefined} max={to} onChange={(e) => setFrom(e.target.value)}
                aria-label="From" className="h-7 rounded border border-line-strong bg-panel px-1.5 text-xs num" />
              <input type="date" value={to} min={from} max={f.latest ?? undefined} onChange={(e) => setTo(e.target.value)}
                aria-label="To" className="h-7 rounded border border-line-strong bg-panel px-1.5 text-xs num" />
            </div>
            <Button size="sm" variant="primary" className="mt-2 w-full" disabled={!from || !to || from > to}
              onClick={() => {
                f.setCustom(from, to);
                setOpen(false);
              }}>
              Apply
            </Button>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
