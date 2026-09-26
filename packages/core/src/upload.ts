import { INGEST_CHUNK, type IngestBeginRequest, type IngestBeginResponse, type IngestRowsRequest, type IngestTuple } from "./api";
import type { AggregateRow } from "./types";

export interface DayPayload {
  date: string;
  totalRows: number;
  reasons: IngestBeginRequest["reasons"];
  firmwares: string[];
  /** [firmware, reason index, count] — station dimension summed out (~115 rows/day). */
  segment: IngestTuple[];
  /** [station, reason index, count] — firmware dimension summed out (~4,800 rows/day). */
  station: IngestTuple[];
}

/** Splits aggregate rows into the two fact tables, one payload per report date. */
export function buildDayPayloads(rows: readonly AggregateRow[]): DayPayload[] {
  const byDate = new Map<string, AggregateRow[]>();
  for (const r of rows) {
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }

  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => {
    const reasonIdx = new Map<string, number>();
    const reasons: DayPayload["reasons"] = [];
    const idx = (r: AggregateRow) => {
      const k = `${r.reason ?? ""}\u0000${r.emspEmpty ? 1 : 0}`;
      let i = reasonIdx.get(k);
      if (i === undefined) {
        i = reasons.length;
        reasons.push({ reason: r.reason, emspEmpty: r.emspEmpty });
        reasonIdx.set(k, i);
      }
      return i;
    };
    const seg = new Map<string, IngestTuple>();
    const sta = new Map<string, IngestTuple>();
    const bump = (m: Map<string, IngestTuple>, key: string, i: number, n: number) => {
      const k = `${key}\u0000${i}`;
      const t = m.get(k);
      if (t) t[2] += n;
      else m.set(k, [key, i, n]);
    };
    let totalRows = 0;
    for (const r of list) {
      const i = idx(r);
      bump(seg, r.firmware, i, r.count);
      bump(sta, r.station, i, r.count);
      totalRows += r.count;
    }
    return {
      date, totalRows, reasons,
      firmwares: [...new Set(list.map((r) => r.firmware))].sort(),
      segment: [...seg.values()],
      station: [...sta.values()],
    };
  });
}

export type Post = <T>(path: string, body: unknown) => Promise<T>;

export interface UploadProgress {
  date: string;
  sent: number;
  total: number;
}

/** begin → rows (chunked) → commit. The server reconciles row counts before committing. */
export async function uploadDay(
  post: Post, day: DayPayload, fileName: string, onProgress?: (p: UploadProgress) => void,
): Promise<IngestBeginResponse> {
  const begin = await post<IngestBeginResponse>("/api/ingest/begin", {
    date: day.date, fileName, totalRows: day.totalRows, reasons: day.reasons, firmwares: day.firmwares,
  } satisfies IngestBeginRequest);

  const ids = begin.reasonIds;
  const remap = (t: IngestTuple): IngestTuple => [t[0], ids[t[1]]!, t[2]];
  const total = day.segment.length + day.station.length;
  let sent = 0;
  for (const [table, tuples] of [["segment", day.segment], ["station", day.station]] as const) {
    for (let i = 0; i < tuples.length; i += INGEST_CHUNK) {
      const rows = tuples.slice(i, i + INGEST_CHUNK).map(remap);
      await post("/api/ingest/rows", { date: day.date, table, rows } satisfies IngestRowsRequest);
      sent += rows.length;
      onProgress?.({ date: day.date, sent, total });
    }
  }
  await post("/api/ingest/commit", { date: day.date });
  return begin;
}
