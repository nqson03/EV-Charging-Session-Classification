import type { AggregateRow, StopReasonRule } from "@evsa/core";

export interface ParsedFile {
  fileName: string;
  size: number;
  sheetName: string | null;
  columns: string[];
  missingRequired: string[];
  missingRecommended: string[];
  missingDimensions: string[];
  totalRows: number;
  /** Rows whose thoi_gian_ket_thuc is empty or unreadable. */
  rowsWithoutEndTime: number;
  /** Transactions per end-time date. */
  dateCounts: Record<string, number>;
  /** yymmdd hint from the sheet or file name, e.g. "260922_Transaction". */
  nameDate: string | null;
  /** Aggregates; rows without an end time carry the placeholder date "0000-00-00". */
  rows: AggregateRow[];
  parseMs: number;
}

export type WorkerRequest =
  | { id: number; type: "parse"; file: File }
  | { id: number; type: "export"; rules: StopReasonRule[]; reportDate: string }
  | { id: number; type: "clear" };

export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
