import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover border border-transparent dark:text-[#0b0b0b]",
  secondary: "bg-panel text-ink border border-line-strong hover:bg-panel-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-panel-2 border border-transparent",
  danger: "bg-danger text-white hover:opacity-90 border border-transparent",
};
const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8 px-3 text-[13px] gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-[5px] font-medium whitespace-nowrap transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        variants[variant], sizes[size], className,
      )}
      {...props}
    />
  );
});
