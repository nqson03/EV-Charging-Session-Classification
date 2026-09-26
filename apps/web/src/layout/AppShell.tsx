// Cpu, MapPin: re-add when Firmware/Stations pages are re-enabled
import { Database, LayoutGrid, ListChecks, Moon, PlugZap, Sun } from "lucide-react";
import { useState, type ComponentType } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useMetaQuery } from "../lib/api";
import { cn } from "../lib/cn";
import { day } from "../lib/format";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const ANALYTICS: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutGrid },
  { to: "/charger-faults", label: "Charger faults", icon: PlugZap },
  // Temporarily hidden:
  // { to: "/firmware", label: "Firmware & models", icon: Cpu },
  // { to: "/stations", label: "Stations", icon: MapPin },
];
const DATA: NavItem[] = [
  { to: "/data", label: "Data uploads", icon: Database },
  { to: "/rules", label: "Classification rules", icon: ListChecks },
];

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-6 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="6" fill="var(--accent)" />
      <path d="M8 21h4l3-9 3 12 3-7h3" fill="none" stroke="var(--panel)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
  };
  return { dark, toggle };
}

function NavGroup({ title, items, search }: { title: string; items: NavItem[]; search: string }) {
  return (
    <div>
      <div className="px-2.5 pb-1 eyebrow">{title}</div>
      <ul className="space-y-px">
        {items.map((i) => (
          <li key={i.to}>
            <NavLink
              to={{ pathname: i.to, search }}
              end={i.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex h-8 items-center gap-2.5 rounded-[5px] px-2.5 text-[13px] transition-colors",
                  isActive ? "bg-panel font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "text-ink-2 hover:bg-panel/60 hover:text-ink",
                )
              }
            >
              <i.icon className="size-4 shrink-0 opacity-80" />
              {i.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppShell() {
  const { data: meta } = useMetaQuery();
  const { dark, toggle } = useTheme();
  const { search } = useLocation();
  // Keep the date range when moving between analytics pages.
  const keep = new URLSearchParams(search);
  const carried = new URLSearchParams();
  for (const k of ["range", "from", "to", "period"]) {
    const v = keep.get(k);
    if (v) carried.set(k, v);
  }
  const qs = carried.toString() ? `?${carried}` : "";
  const latest = meta?.uploads.find((u) => u.status === "complete")?.date;

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-[228px] shrink-0 flex-col border-r border-line bg-page lg:flex">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Mark />
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">Session Quality</div>
            <div className="text-2xs text-ink-3">EV charging network</div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-2 pt-3">
          <NavGroup title="Analytics" items={ANALYTICS} search={qs} />
          <NavGroup title="Data" items={DATA} search={qs} />
        </nav>
        <div className="space-y-2 border-t border-line px-4 py-3 text-xs">
          <div className="flex items-center justify-between text-ink-3">
            <span>Data through</span>
            <span className="num text-ink-2">{latest ? day(latest) : "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-ink-2" title={meta?.user}>{meta && meta.user !== "anonymous" ? meta.user : " "}</span>
            <button onClick={toggle} className="rounded p-1 text-ink-3 hover:bg-panel hover:text-ink" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
              {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact navigation below lg */}
        <div className="flex items-center gap-3 border-b border-line bg-page px-4 lg:hidden">
          <Mark />
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {[...ANALYTICS, ...DATA].map((i) => (
              <NavLink key={i.to} to={{ pathname: i.to, search: qs }} end={i.to === "/"}
                className={({ isActive }) => cn("flex h-11 items-center border-b-2 px-2 text-xs whitespace-nowrap", isActive ? "border-ink font-medium text-ink" : "border-transparent text-ink-2")}>
                {i.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
