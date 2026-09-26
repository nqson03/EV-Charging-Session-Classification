import { AlertTriangle, CheckCircle2, CircleAlert, FileSpreadsheet, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { useDispatch } from "react-redux";
import {
  buildDayPayloads, buildLookup, COL, summarize, uploadDay, type AggregateRow, type Upload,
} from "@evsa/core";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Callout } from "../components/ui/callout";
import { Dialog } from "../components/ui/dialog";
import { Panel } from "../components/ui/panel";
import { EmptyState, ErrorNote } from "../components/ui/states";
import { Table, TD, TH, TR } from "../components/ui/table";
import { Page, PageHeader } from "../layout/PageHeader";
import { api, errorMessage, postJson, useDeleteUploadMutation, useMetaQuery, useRulesQuery } from "../lib/api";
import { cn } from "../lib/cn";
import { clearFile, exportClassified, parseFile, saveBlob } from "../lib/fileWorker";
import { bytes, dateTime, day, int, pct, plural } from "../lib/format";
import type { ParsedFile } from "../workers/protocol";

type Stage =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | { kind: "review"; file: ParsedFile }
  | { kind: "saving"; file: ParsedFile; sent: number; total: number }
  | { kind: "saved"; file: ParsedFile; date: string; replaced: boolean };

const ACCEPT = ".xlsx,.csv";

function modeDate(counts: Record<string, number>) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/** Every row of a file belongs to one report date (spec: one file = one day). */
function assignDate(rows: AggregateRow[], date: string): AggregateRow[] {
  return rows.map((r) => (r.date === date ? r : { ...r, date }));
}

function Check({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : CircleAlert;
  return (
    <li className="flex items-start gap-2 text-[13px]">
      <Icon className={cn("mt-0.5 size-4 shrink-0", ok ? "text-good" : warn ? "text-warn-ink" : "text-danger")} />
      <span className="text-ink-2">{children}</span>
    </li>
  );
}

function Dropzone({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed px-6 py-10 text-center transition-colors",
        over ? "border-accent bg-accent-soft" : "border-line-strong bg-panel-2/50",
      )}
    >
      <UploadCloud className="size-5 text-ink-3" />
      <p className="mt-2 text-[13px] font-medium">Drop a daily transaction export here</p>
      <p className="mt-0.5 text-xs text-ink-3">.xlsx or .csv · one file per day · raw rows stay in this browser</p>
      <Button className="mt-4" onClick={() => input.current?.click()} disabled={busy}>Choose file</Button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Review({
  file, reportDate, setReportDate, existing, onSave, onDiscard, saving, progress,
}: {
  file: ParsedFile;
  reportDate: string;
  setReportDate: (d: string) => void;
  existing: Upload | undefined;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
  progress: number;
}) {
  const rulesQ = useRulesQuery();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const rules = useMemo(
    () => rulesQ.data?.rules.map((r) => ({ name: r.name, code: r.code, aliases: r.aliases, category: r.category })),
    [rulesQ.data],
  );
  const preview = useMemo(() => (rules ? summarize(file.rows, buildLookup(rules)) : null), [rules, file.rows]);

  const dates = Object.entries(file.dateCounts).sort((a, b) => b[1] - a[1]);
  const detected = modeDate(file.dateCounts);
  const otherDates = dates.filter(([d]) => d !== reportDate);
  const blocking = file.missingRequired.length > 0 || !reportDate || file.totalRows === 0;

  const doExport = async () => {
    if (!rules) return;
    setExporting(true);
    setExportError("");
    try {
      const blob = await exportClassified(rules, reportDate);
      saveBlob(blob, `${file.fileName.replace(/\.(xlsx|csv)$/i, "")}_classified.xlsx`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-panel-2/60 px-3.5 py-2.5">
        <FileSpreadsheet className="size-4 text-ink-3" />
        <span className="font-medium">{file.fileName}</span>
        <span className="text-xs text-ink-3">
          {bytes(file.size)}{file.sheetName ? ` · sheet “${file.sheetName}”` : ""} · {int(file.totalRows)} rows · read in {(file.parseMs / 1000).toFixed(1)} s
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-2 eyebrow">Checks</div>
          <ul className="space-y-1.5">
            <Check ok={file.missingRequired.length === 0}>
              {file.missingRequired.length === 0
                ? <>Required columns present: <code className="font-mono text-xs">{COL.reason}</code>, <code className="font-mono text-xs">{COL.emsp}</code></>
                : <>Missing required column{file.missingRequired.length > 1 ? "s" : ""}: {file.missingRequired.map((c) => <code key={c} className="mr-1 font-mono text-xs">{c}</code>)} — the file can’t be classified.</>}
            </Check>
            <Check ok={file.missingRecommended.length === 0} warn>
              {file.missingRecommended.length === 0
                ? <><code className="font-mono text-xs">{COL.endTime}</code> present — report date detected automatically</>
                : <>No <code className="font-mono text-xs">{COL.endTime}</code> column — set the report date manually</>}
            </Check>
            <Check ok={file.missingDimensions.length === 0} warn>
              {file.missingDimensions.length === 0
                ? <>Station and firmware columns present</>
                : <>Missing {file.missingDimensions.map((c) => <code key={c} className="mr-1 font-mono text-xs">{c}</code>)} — those views will show “(unknown)”</>}
            </Check>
            {file.rowsWithoutEndTime > 0 && (
              <Check ok={false} warn>{plural(file.rowsWithoutEndTime, "row")} without a readable end time — counted under the report date</Check>
            )}
            {otherDates.length > 0 && detected && (
              <Check ok={false} warn>
                {plural(otherDates.reduce((n, [, c]) => n + c, 0), "row")} end on another day ({otherDates.slice(0, 3).map(([d]) => day(d)).join(", ")}) — counted under the report date
              </Check>
            )}
          </ul>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-2">Report date</span>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="num h-8 rounded-[5px] border border-line-strong bg-panel px-2 text-[13px]"
              />
            </label>
            <span className="pb-2 text-xs text-ink-3">
              {detected ? `Detected from ${COL.endTime}` : file.nameDate ? "Taken from the file name" : "Not detected — pick the day this file covers"}
            </span>
          </div>
          {existing && reportDate && (
            <Callout tone="warn" className="mt-3" title={`${day(reportDate)} already has data`}>
              Uploaded {dateTime(existing.uploadedAt)}{existing.uploadedBy !== "anonymous" ? ` by ${existing.uploadedBy}` : ""} ({existing.fileName}, {int(existing.totalRows)} rows
              {existing.status === "pending" ? ", incomplete" : ""}). Saving replaces it.
            </Callout>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 eyebrow">Preview with current rules</div>
          {preview ? (
            <>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[5px] border border-line bg-line">
                {[
                  ["Success rate", preview.rates.success, preview.success],
                  ["Failed rate", preview.rates.failed, preview.failed],
                  ["Failed EVCS related", preview.rates.evcs, preview.evcs],
                  ["Failed Non-EVCS related", preview.rates.nonEvcs, preview.nonEvcs],
                ].map(([label, r, n]) => (
                  <div key={label as string} className="bg-panel px-3 py-2.5">
                    <div className="text-xs text-ink-3">{label}</div>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span className="text-[17px] font-semibold">{pct(r as number)}</span>
                      <span className="num text-xs text-ink-3">{int(n as number)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-3">
                Top 3 EVCS: {preview.evcsReasons.slice(0, 3).map((r) => `${r.label} ${pct(r.rate)}`).join(" · ") || "—"}
              </p>
              {preview.unclassified > 0 && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-warn-ink">
                  <AlertTriangle className="size-3.5" />
                  {plural(preview.unclassified, "transaction")} unclassified: {preview.unclassifiedReasons.map((r) => r.label).join(", ")}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-ink-3">{rulesQ.isError ? errorMessage(rulesQ.error) : "Loading rules…"}</p>
          )}
        </div>
      </div>

      {exportError && <ErrorNote>{exportError}</ErrorNote>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="ghost" onClick={onDiscard} disabled={saving}>Discard</Button>
        <div className="flex flex-wrap items-center gap-2">
          {saving && (
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="num w-9">{Math.round(progress * 100)}%</span>
            </div>
          )}
          <Button onClick={doExport} disabled={!rules || exporting || file.missingRequired.length > 0}>
            {exporting ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Export classified .xlsx
          </Button>
          <Button variant="primary" onClick={onSave} disabled={blocking || saving}>
            {saving && <Loader2 className="animate-spin" />}
            {existing ? "Replace day in history" : "Save to history"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DataPage() {
  const metaQ = useMetaQuery();
  const dispatch = useDispatch();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [reportDate, setReportDate] = useState("");
  const [error, setError] = useState("");
  const [toDelete, setToDelete] = useState<Upload | null>(null);
  const [deleteUpload, del] = useDeleteUploadMutation();

  const uploads = metaQ.data?.uploads ?? [];
  const existing = uploads.find((u) => u.date === reportDate);

  const onFile = useCallback(async (f: File) => {
    if (!/\.(xlsx|csv)$/i.test(f.name)) {
      setError("Only .xlsx and .csv files are supported.");
      return;
    }
    setError("");
    setStage({ kind: "parsing", fileName: f.name });
    try {
      const file = await parseFile(f);
      setReportDate(modeDate(file.dateCounts) ?? file.nameDate ?? "");
      setStage({ kind: "review", file });
    } catch (e) {
      setError(`Couldn’t read ${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      setStage({ kind: "idle" });
    }
  }, []);

  const save = async () => {
    if (stage.kind !== "review") return;
    const file = stage.file;
    setError("");
    const [day0] = buildDayPayloads(assignDate(file.rows, reportDate));
    if (!day0) return;
    setStage({ kind: "saving", file, sent: 0, total: day0.segment.length + day0.station.length });
    try {
      const res = await uploadDay(postJson, day0, file.fileName, (p) =>
        setStage({ kind: "saving", file, sent: p.sent, total: p.total }),
      );
      dispatch(api.util.invalidateTags(["Meta", "Report", "Rules", "Firmware"]));
      setStage({ kind: "saved", file, date: day0.date, replaced: res.replaced });
    } catch (e) {
      setError(`Upload failed: ${e instanceof Error ? e.message : String(e)}. Nothing was committed for this day; try again.`);
      setStage({ kind: "review", file });
    }
  };

  const discard = () => {
    void clearFile();
    setStage({ kind: "idle" });
    setReportDate("");
  };

  return (
    <>
      <PageHeader
        title="Data uploads"
        subtitle="Daily transaction exports. Files are read in your browser; only aggregated counts are stored."
      />
      <Page>
        {error && <ErrorNote>{error}</ErrorNote>}

        <Panel
          title="Upload a daily file"
          description="Classified with the current rules. Uploading a day that already exists replaces it."
        >
          {stage.kind === "idle" && <Dropzone onFile={onFile} busy={false} />}
          {stage.kind === "parsing" && (
            <div className="flex items-center justify-center gap-2 rounded-md border border-line bg-panel-2/50 py-14 text-[13px] text-ink-2">
              <Loader2 className="size-4 animate-spin" /> Reading {stage.fileName}…
            </div>
          )}
          {(stage.kind === "review" || stage.kind === "saving") && (
            <Review
              file={stage.file}
              reportDate={reportDate}
              setReportDate={setReportDate}
              existing={existing}
              onSave={save}
              onDiscard={discard}
              saving={stage.kind === "saving"}
              progress={stage.kind === "saving" ? stage.sent / Math.max(1, stage.total) : 0}
            />
          )}
          {stage.kind === "saved" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-panel-2/50 px-4 py-3">
              <div className="flex items-center gap-2 text-[13px]">
                <CheckCircle2 className="size-4 text-good" />
                <span>
                  {day(stage.date)} {stage.replaced ? "replaced" : "saved"} · {int(stage.file.totalRows)} transactions from {stage.file.fileName}
                </span>
              </div>
              <Button onClick={discard}>Upload another file</Button>
            </div>
          )}
        </Panel>

        <Panel title="History" description={uploads.length ? `${plural(uploads.length, "day")} stored` : undefined} bodyClassName="pb-0">
          {uploads.length === 0 ? (
            <EmptyState title="No days uploaded yet" className="py-8">Uploaded days appear here.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TH>Report date</TH>
                  <TH>File</TH>
                  <TH align="right">Transactions</TH>
                  <TH>Uploaded</TH>
                  <TH>By</TH>
                  <TH>Status</TH>
                  <TH className="w-10"><span className="sr-only">Actions</span></TH>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <TR key={u.date}>
                    <TD className="num font-medium">{day(u.date)}</TD>
                    <TD className="max-w-[260px] truncate text-ink-2" title={u.fileName}>{u.fileName}</TD>
                    <TD align="right">{int(u.totalRows)}</TD>
                    <TD className="num text-ink-2">{dateTime(u.uploadedAt)}</TD>
                    <TD className="text-ink-2">{u.uploadedBy === "anonymous" ? "—" : u.uploadedBy}</TD>
                    <TD>{u.status === "complete" ? <Badge>Complete</Badge> : <Badge tone="warn">Incomplete — re-upload</Badge>}</TD>
                    <TD>
                      <button
                        onClick={() => setToDelete(u)}
                        className="rounded p-1 text-ink-3 hover:bg-panel-2 hover:text-danger"
                        aria-label={`Delete ${day(u.date)}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </Page>

      <Dialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        width="sm"
        title={toDelete ? `Delete ${day(toDelete.date)}?` : ""}
        description="The day disappears from every dashboard. Re-upload the file to restore it."
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={del.isLoading}
              onClick={async () => {
                if (!toDelete) return;
                try {
                  await deleteUpload(toDelete.date).unwrap();
                  setToDelete(null);
                } catch (e) {
                  setError(errorMessage(e));
                  setToDelete(null);
                }
              }}
            >
              Delete day
            </Button>
          </>
        }
      />
    </>
  );
}
