import { toReportDate } from "./dates";
import type { AggregateRow } from "./types";

/** Source column names. Kept in the customer's original Vietnamese schema (spec section 2). */
export const COL = {
  reason: "li_do_dung_sac",
  emsp: "ma_giao_dich_tren_emsp",
  endTime: "thoi_gian_ket_thuc",
  station: "ma_tram",
  firmware: "phien_ban_firmware",
} as const;

export const REQUIRED_COLUMNS = [COL.reason, COL.emsp] as const;
export const RECOMMENDED_COLUMNS = [COL.endTime] as const;
/** Needed for the station and firmware views; missing ones are reported, not fatal. */
export const DIMENSION_COLUMNS = [COL.station, COL.firmware] as const;

export type ColumnIndex = Record<(typeof COL)[keyof typeof COL], number>;

export interface HeaderCheck {
  index: ColumnIndex;
  missingRequired: string[];
  missingRecommended: string[];
  missingDimensions: string[];
}

const norm = (h: unknown) => String(h ?? "").trim().toLowerCase();

export function checkHeader(header: readonly unknown[]): HeaderCheck {
  const names = header.map(norm);
  const find = (c: string) => names.indexOf(c);
  const index = Object.fromEntries(Object.values(COL).map((c) => [c, find(c)])) as ColumnIndex;
  const missing = (cols: readonly string[]) => cols.filter((c) => index[c as keyof ColumnIndex] < 0);
  return {
    index,
    missingRequired: missing(REQUIRED_COLUMNS),
    missingRecommended: missing(RECOMMENDED_COLUMNS),
    missingDimensions: missing(DIMENSION_COLUMNS),
  };
}

const text = (v: unknown): string | null => {
  if (v == null) return null;
  const s = (v instanceof Date ? v.toISOString() : String(v)).trim();
  return s === "" ? null : s;
};

export interface IngestReport {
  totalRows: number;
  /** Rows whose end time could not be read and fell back to `fallbackDate`. */
  rowsUsingFallbackDate: number;
  /** Rows dropped because no date could be determined at all. */
  rowsWithoutDate: number;
  dates: string[];
}

export const UNKNOWN = "(unknown)";

/**
 * Streams source rows into counts keyed by raw dimensions. Nothing is classified here,
 * so the server stays the single place where rules are applied.
 */
export function createAggregator(index: ColumnIndex, fallbackDate: string | null) {
  const buckets = new Map<string, AggregateRow>();
  const report: IngestReport = { totalRows: 0, rowsUsingFallbackDate: 0, rowsWithoutDate: 0, dates: [] };
  const dates = new Set<string>();
  const cell = (row: readonly unknown[], i: number) => (i >= 0 ? row[i] : undefined);

  return {
    add(row: readonly unknown[]) {
      report.totalRows++;
      let date = toReportDate(cell(row, index[COL.endTime]));
      if (!date) {
        date = fallbackDate;
        if (!date) {
          report.rowsWithoutDate++;
          return;
        }
        report.rowsUsingFallbackDate++;
      }
      const station = text(cell(row, index[COL.station])) ?? UNKNOWN;
      const firmware = text(cell(row, index[COL.firmware])) ?? UNKNOWN;
      const reason = text(cell(row, index[COL.reason]));
      const emspEmpty = text(cell(row, index[COL.emsp])) === null;

      const key = `${date}\u0000${station}\u0000${firmware}\u0000${reason ?? ""}\u0000${emspEmpty ? 1 : 0}`;
      const b = buckets.get(key);
      if (b) b.count++;
      else buckets.set(key, { date, station, firmware, reason, emspEmpty, count: 1 });
      dates.add(date);
    },
    result(): { rows: AggregateRow[]; report: IngestReport } {
      return { rows: [...buckets.values()], report: { ...report, dates: [...dates].sort() } };
    },
  };
}
