/** Wire types shared by the Worker API and the web client. */
import type { ChargerModel } from "./firmware";
import type { Period } from "./summary";
import type { Category, RuleCategory } from "./types";

export type Generation = "old" | "new" | "unknown";

export interface Upload {
  date: string;
  fileName: string;
  totalRows: number;
  status: "pending" | "complete";
  uploadedAt: string;
  uploadedBy: string;
}

export interface Meta {
  user: string;
  dataVersion: number;
  newFirmwareFrom: string;
  uploads: Upload[];
}

export interface FirmwareDim {
  firmware: string;
  build: string | null;
  generation: Generation;
  model: ChargerModel;
  ratingKw: number | null;
  manual: boolean;
}

/** Classified counts grouped by period × firmware × label. Everything on the dashboards derives from this. */
export interface ReportRow {
  /** Period key: YYYY-MM-DD (day), Monday's date (week) or YYYY-MM (month). */
  p: string;
  fw: string;
  cat: Category;
  label: string;
  code: string | null;
  n: number;
}

export interface ReportResponse {
  from: string;
  to: string;
  period: Period;
  /** Dates in range that have a completed upload. */
  dates: string[];
  rows: ReportRow[];
  firmware: FirmwareDim[];
}

export interface StationRow {
  station: string;
  cat: Category;
  label: string;
  n: number;
}

export interface StationsResponse {
  from: string;
  to: string;
  rows: StationRow[];
}

export interface RuleDto {
  name: string;
  code: string | null;
  aliases: string[];
  category: RuleCategory;
  source: "spec" | "custom";
  updatedAt: string;
  updatedBy: string;
}

export interface ReasonDimDto {
  reason: string;
  emspEmpty: boolean;
  category: Category;
  label: string;
  code: string | null;
  step: number;
  firstSeen: string;
  lastSeen: string;
}

export interface RuleChangeDto {
  at: string;
  by: string;
  action: "create" | "update" | "delete" | "reset";
  name: string;
}

export interface RulesResponse {
  rules: RuleDto[];
  observed: ReasonDimDto[];
  changes: RuleChangeDto[];
}

export interface IngestBeginRequest {
  date: string;
  fileName: string;
  totalRows: number;
  reasons: { reason: string | null; emspEmpty: boolean }[];
  firmwares: string[];
}

export interface IngestBeginResponse {
  /** reason_dim id for each entry of `reasons`, same order. */
  reasonIds: number[];
  replaced: boolean;
}

/** [key, reasonId, count] where key is firmware (segment) or station (station). */
export type IngestTuple = [string, number, number];

export interface IngestRowsRequest {
  date: string;
  table: "segment" | "station";
  rows: IngestTuple[];
}

export const INGEST_CHUNK = 2000;
