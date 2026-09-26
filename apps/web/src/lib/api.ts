import { createApi, fetchBaseQuery, type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import type { SerializedError } from "@reduxjs/toolkit";
import type {
  FirmwareDim, Generation, Meta, Period, ReportResponse, RuleDto, RulesResponse, StationsResponse,
} from "@evsa/core";

export interface RangeArgs {
  from: string;
  to: string;
}

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["Meta", "Report", "Rules", "Firmware"],
  endpoints: (b) => ({
    meta: b.query<Meta, void>({ query: () => "meta", providesTags: ["Meta"] }),
    report: b.query<ReportResponse, RangeArgs & { period: Period }>({
      query: (params) => ({ url: "report", params }),
      providesTags: ["Report"],
    }),
    stations: b.query<StationsResponse, RangeArgs>({
      query: (params) => ({ url: "stations", params }),
      providesTags: ["Report"],
    }),
    rules: b.query<RulesResponse, void>({ query: () => "rules", providesTags: ["Rules"] }),
    firmware: b.query<{ newFirmwareFrom: string; firmware: FirmwareDim[] }, void>({
      query: () => "firmware",
      providesTags: ["Firmware"],
    }),
    putRule: b.mutation<void, Pick<RuleDto, "name" | "code" | "aliases" | "category">>({
      query: ({ name, ...body }) => ({ url: `rules/${encodeURIComponent(name)}`, method: "PUT", body }),
      invalidatesTags: ["Rules", "Report", "Meta"],
    }),
    deleteRule: b.mutation<void, string>({
      query: (name) => ({ url: `rules/${encodeURIComponent(name)}`, method: "DELETE" }),
      invalidatesTags: ["Rules", "Report", "Meta"],
    }),
    resetRules: b.mutation<void, void>({
      query: () => ({ url: "rules/reset", method: "POST", body: {} }),
      invalidatesTags: ["Rules", "Report", "Meta"],
    }),
    putFirmwareCutoff: b.mutation<void, string>({
      query: (newFirmwareFrom) => ({ url: "settings/firmware", method: "PUT", body: { newFirmwareFrom } }),
      invalidatesTags: ["Firmware", "Report", "Meta"],
    }),
    putFirmware: b.mutation<void, { firmware: string; generation: Generation; model: FirmwareDim["model"] }>({
      query: ({ firmware, ...body }) => ({ url: `firmware/${encodeURIComponent(firmware)}`, method: "PUT", body }),
      invalidatesTags: ["Firmware", "Report"],
    }),
    resetFirmware: b.mutation<void, string>({
      query: (firmware) => ({ url: `firmware/${encodeURIComponent(firmware)}/override`, method: "DELETE" }),
      invalidatesTags: ["Firmware", "Report"],
    }),
    deleteUpload: b.mutation<void, string>({
      query: (date) => ({ url: `uploads/${date}`, method: "DELETE" }),
      invalidatesTags: ["Meta", "Report", "Rules"],
    }),
  }),
});

export const {
  useMetaQuery, useReportQuery, useStationsQuery, useRulesQuery, useFirmwareQuery,
  usePutRuleMutation, useDeleteRuleMutation, useResetRulesMutation, usePutFirmwareCutoffMutation,
  usePutFirmwareMutation, useResetFirmwareMutation, useDeleteUploadMutation,
} = api;

export function errorMessage(err: FetchBaseQueryError | SerializedError | undefined | unknown): string {
  if (!err) return "";
  if (typeof err === "object" && err && "status" in err) {
    const e = err as FetchBaseQueryError;
    if (e.data && typeof e.data === "object" && "error" in e.data) return String((e.data as { error: string }).error);
    if (e.status === "FETCH_ERROR") return "Can't reach the server. Check your connection and try again.";
    return `Request failed (${String(e.status)})`;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) return String((err as SerializedError).message);
  return "Something went wrong";
}

/** JSON POST used by the chunked uploader (outside RTK Query: it's a multi-step flow). */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}
