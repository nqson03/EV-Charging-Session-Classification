const intFmt = new Intl.NumberFormat("en-US");
const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const int = (n: number) => intFmt.format(n);
export const compact = (n: number) => (Math.abs(n) < 10_000 ? intFmt.format(n) : compactFmt.format(n));

/** Every rate in the product shows exactly 2 decimals (spec section 5). */
export const pct = (r: number) => `${(Math.round(r * 10000) / 100).toFixed(2)}%`;

/** Difference of two rates in percentage points, signed. */
export const pp = (d: number) => {
  const v = Math.round(d * 10000) / 100;
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(2)} pp`;
};

const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];

/** 22 Sep 2026 */
export function day(iso: string) {
  const [y, m, d] = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** 22 Sep */
export function dayShort(iso: string) {
  const [, m, d] = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

export function month(key: string) {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

export function isoWeekNumber(iso: string) {
  const [y, m, d] = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const start = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - start) / 86400000 + 1) / 7);
}

/** Axis/tooltip label for a period key returned by the API. */
export function periodLabel(key: string, period: "day" | "week" | "month", long = false) {
  if (period === "month") return month(key);
  if (period === "week") return long ? `Week ${isoWeekNumber(key)} · from ${day(key)}` : `W${isoWeekNumber(key)}`;
  return long ? day(key) : dayShort(key);
}

export function dateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date}, ${time}`;
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${int(n)} ${n === 1 ? one : many}`;
