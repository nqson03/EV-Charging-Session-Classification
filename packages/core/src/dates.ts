const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function valid(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

/**
 * Report date (YYYY-MM-DD) from a thoi_gian_ket_thuc cell. Accepts the source format
 * "dd/mm/yyyy HH:MM:SS", ISO strings, JS Dates (as produced by spreadsheet readers)
 * and raw Excel serial numbers. Times are wall-clock as recorded; no timezone shift.
 */
export function toReportDate(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Spreadsheet readers build Dates from wall-clock values in UTC.
    return iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  if (typeof value === "number") {
    // Excel serial date (1900 system). 25569 = 1970-01-01.
    if (value < 1 || value > 2958465) return null;
    const ms = Math.round((value - 25569) * 86400) * 1000;
    const d = new Date(ms);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  const s = String(value).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return valid(y, mo, d) ? iso(y, mo, d) : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return valid(y, mo, d) ? iso(y, mo, d) : null;
  }
  return null;
}

/** Date hint from a sheet or file name that starts with yymmdd, e.g. "260922_Transaction". */
export function dateFromName(name: string): string | null {
  const m = /(?:^|[^\d])(\d{2})(\d{2})(\d{2})(?:[^\d]|$)/.exec(name);
  if (!m) return null;
  const [y, mo, d] = [2000 + Number(m[1]), Number(m[2]), Number(m[3])];
  return valid(y, mo, d) ? iso(y, mo, d) : null;
}

/** ISO-8601 week key, e.g. "2026-W39" (weeks start Monday). */
export function isoWeek(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

export const monthKey = (date: string) => date.slice(0, 7);
