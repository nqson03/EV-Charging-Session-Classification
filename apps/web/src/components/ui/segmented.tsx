import { cn } from "../../lib/cn";

export function Segmented<T extends string>({
  value, options, onChange, size = "md", label,
}: {
  value: T;
  options: { id: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[5px] border border-line-strong bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          title={o.hint}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-[3px] font-medium transition-colors",
            size === "sm" ? "h-6 px-2 text-xs" : "h-[26px] px-2.5 text-xs",
            value === o.id ? "bg-ink text-panel" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
