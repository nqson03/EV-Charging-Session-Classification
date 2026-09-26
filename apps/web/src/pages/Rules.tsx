import { Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import {
  Category, LABEL_CUSTOMER_OWES, LABEL_NOT_STARTED, SUCCESS_REASON,
  type ChargerModel, type FirmwareDim, type Generation, type RuleCategory, type RuleDto,
} from "@evsa/core";
import { ErrorPage, LoadingPage } from "../components/common";
import { Badge, CategoryTag, Code } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Callout } from "../components/ui/callout";
import { Dialog } from "../components/ui/dialog";
import { Field, Input, Select } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { ErrorNote } from "../components/ui/states";
import { Table, TD, TH, TR } from "../components/ui/table";
import { Page, PageHeader } from "../layout/PageHeader";
import {
  errorMessage, useDeleteRuleMutation, useFirmwareQuery, usePutFirmwareCutoffMutation, usePutFirmwareMutation,
  usePutRuleMutation, useResetFirmwareMutation, useResetRulesMutation, useRulesQuery,
} from "../lib/api";
import { dateTime, day } from "../lib/format";

type Draft = { name: string; code: string; aliases: string; category: RuleCategory; isNew: boolean };

function RuleDialog({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const [d, setD] = useState<Draft | null>(draft);
  const [putRule, st] = usePutRuleMutation();
  const [err, setErr] = useState("");
  useEffect(() => {
    setD(draft);
    setErr("");
  }, [draft]);
  if (!d) return null;

  const save = async () => {
    setErr("");
    try {
      await putRule({
        name: d.name.trim(),
        code: d.code.trim() || null,
        aliases: d.aliases.split(",").map((a) => a.trim()).filter(Boolean),
        category: d.category,
      }).unwrap();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={d.isNew ? "Add stop reason rule" : `Edit ${d.name}`}
      description="Applies to all history immediately: every stored day is re-classified."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!d.name.trim() || st.isLoading}>Save rule</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-[1fr_130px] gap-3">
          <Field label="Stop reason (li_do_dung_sac)" hint="Matched without regard to case. Used as the statistics label.">
            <Input value={d.name} disabled={!d.isNew} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus={d.isNew} />
          </Field>
          <Field label="Error code" hint="Optional">
            <Input value={d.code} placeholder="SR0000" onChange={(e) => setD({ ...d, code: e.target.value })} className="font-mono" />
          </Field>
        </div>
        <Field label="Aliases" hint="Other spellings seen in source data, separated by commas.">
          <Input value={d.aliases} onChange={(e) => setD({ ...d, aliases: e.target.value })} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-ink-2">Classification</legend>
          <div className="grid grid-cols-2 gap-2">
            {([Category.EvcsFault, Category.NonEvcsFault] as const).map((c) => (
              <label
                key={c}
                className={`flex cursor-pointer items-start gap-2 rounded-[5px] border px-3 py-2 ${d.category === c ? "border-accent bg-accent-soft" : "border-line-strong"}`}
              >
                <input type="radio" name="category" className="mt-0.5 accent-[var(--accent)]" checked={d.category === c} onChange={() => setD({ ...d, category: c })} />
                <span>
                  <span className="block text-[13px] font-medium">{c}</span>
                  <span className="block text-xs text-ink-3">{c === Category.EvcsFault ? "Charger related" : "Not caused by the charger"}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
    </Dialog>
  );
}

function Procedure() {
  const steps = [
    { n: 1, cond: <><Code>li_do_dung_sac</Code> = <Code>{SUCCESS_REASON}</Code></>, out: <CategoryTag category={Category.Success} /> },
    {
      n: 2, cond: <><Code>ma_giao_dich_tren_emsp</Code> is empty</>,
      out: <span><CategoryTag category={Category.NonEvcsFault} /><span className="block text-xs text-ink-3">label: the stop reason, or “{LABEL_CUSTOMER_OWES}” if empty</span></span>,
    },
    { n: 3, cond: <>the stop reason is empty</>, out: <span><CategoryTag category={Category.EvcsFault} /><span className="block text-xs text-ink-3">label: {LABEL_NOT_STARTED}</span></span> },
    { n: 3, cond: <>otherwise</>, out: <span>look up the mapping; no match stays <Badge tone="warn">Unclassified</Badge> (never guessed)</span> },
  ];
  return (
    <ol className="divide-y divide-line">
      {steps.map((s, i) => (
        <li key={i} className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 gap-y-1 py-2.5 text-[13px]">
          <span className="num text-ink-3">{s.n}</span>
          <span className="break-words text-ink">If {s.cond}</span>
          <span className="col-start-2 text-ink-2">→ {s.out}</span>
        </li>
      ))}
    </ol>
  );
}

function FirmwareSection() {
  const q = useFirmwareQuery();
  const [cutoff, setCutoff] = useState("");
  const [putCutoff, cst] = usePutFirmwareCutoffMutation();
  const [putFw] = usePutFirmwareMutation();
  const [resetFw] = useResetFirmwareMutation();
  const [err, setErr] = useState("");
  useEffect(() => {
    if (q.data) setCutoff(q.data.newFirmwareFrom);
  }, [q.data]);

  const run = async (p: Promise<unknown>) => {
    setErr("");
    try {
      await p;
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const update = (d: FirmwareDim, patch: Partial<Pick<FirmwareDim, "generation" | "model">>) =>
    run(putFw({ firmware: d.firmware, generation: patch.generation ?? d.generation, model: patch.model ?? d.model }).unwrap());

  const valid = /^\d{6}$/.test(cutoff);
  const asDate = valid ? `20${cutoff.slice(0, 2)}-${cutoff.slice(2, 4)}-${cutoff.slice(4, 6)}` : "";

  return (
    <Panel
      title="Firmware lines & models"
      description="Old vs new firmware is decided by the build stamp at the start of the version string (yymmdd)."
      bodyClassName="pb-0"
    >
      <div id="firmware" className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="New firmware from build" hint={valid && !Number.isNaN(Date.parse(asDate)) ? `Builds stamped ${day(asDate)} or later count as new.` : "Six digits, yymmdd."}>
          <Input value={cutoff} onChange={(e) => setCutoff(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-32 font-mono" />
        </Field>
        <Button onClick={() => run(putCutoff(cutoff).unwrap())} disabled={!valid || cutoff === q.data?.newFirmwareFrom || cst.isLoading} className="mb-[18px]">
          Apply
        </Button>
      </div>
      {err && <div className="mb-3"><ErrorNote>{err}</ErrorNote></div>}
      {q.isError ? (
        <ErrorNote>{errorMessage(q.error)}</ErrorNote>
      ) : (
        <Table>
          <thead>
            <tr>
              <TH>Version</TH>
              <TH>Build</TH>
              <TH>Line</TH>
              <TH>Model</TH>
              <TH>Source</TH>
              <TH className="w-10"><span className="sr-only">Actions</span></TH>
            </tr>
          </thead>
          <tbody>
            {(q.data?.firmware ?? []).map((d) => (
              <TR key={d.firmware}>
                <TD><Code>{d.firmware}</Code></TD>
                <TD className="num font-mono text-xs text-ink-2">{d.build ?? "—"}</TD>
                <TD>
                  <Select value={d.generation} onChange={(e) => update(d, { generation: e.target.value as Generation })} className="w-32" aria-label={`Line for ${d.firmware}`}>
                    <option value="old">Old</option>
                    <option value="new">New</option>
                    <option value="unknown">Unknown</option>
                  </Select>
                </TD>
                <TD>
                  <Select value={d.model} onChange={(e) => update(d, { model: e.target.value as ChargerModel })} className="w-28" aria-label={`Model for ${d.firmware}`}>
                    {["Core", "Kern", "AC", "Other"].map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </TD>
                <TD>{d.manual ? <Badge tone="accent">Set by hand</Badge> : <span className="text-xs text-ink-3">From version string</span>}</TD>
                <TD>
                  {d.manual && (
                    <button onClick={() => run(resetFw(d.firmware).unwrap())} className="rounded p-1 text-ink-3 hover:bg-panel-2 hover:text-ink" aria-label={`Reset ${d.firmware}`} title="Back to automatic">
                      <RotateCcw className="size-3.5" />
                    </button>
                  )}
                </TD>
              </TR>
            ))}
            {q.data && q.data.firmware.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-[13px] text-ink-3">Firmware versions appear after the first upload.</td></tr>
            )}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}

export function RulesPage() {
  const q = useRulesQuery();
  const { hash } = useLocation();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<RuleDto | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleteRule, dst] = useDeleteRuleMutation();
  const [resetRules, rst] = useResetRulesMutation();
  const [err, setErr] = useState("");

  useEffect(() => {
    if (hash && q.data) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash, q.data]);

  const rules = useMemo(() => {
    const n = search.trim().toLowerCase();
    return (q.data?.rules ?? []).filter(
      (r) => !n || r.name.toLowerCase().includes(n) || (r.code ?? "").toLowerCase().includes(n) || r.aliases.some((a) => a.toLowerCase().includes(n)),
    );
  }, [q.data, search]);
  const unmapped = (q.data?.observed ?? []).filter((o) => o.category === Category.Unclassified);

  if (q.isError) return <ErrorPage message={errorMessage(q.error)} />;

  return (
    <>
      <PageHeader
        title="Classification rules"
        subtitle="Business rules v2.0 · changes re-classify every stored day"
        actions={<Button onClick={() => setDraft({ name: "", code: "", aliases: "", category: Category.EvcsFault, isNew: true })} variant="primary"><Plus /> Add rule</Button>}
      />
      {!q.data ? (
        <LoadingPage />
      ) : (
        <Page>
          {err && <ErrorNote>{err}</ErrorNote>}
          {unmapped.length > 0 && (
            <Callout tone="warn" title={`${unmapped.length} stop reason${unmapped.length > 1 ? "s" : ""} in the data ${unmapped.length > 1 ? "have" : "has"} no rule`}>
              <ul className="mt-1.5 space-y-1.5">
                {unmapped.map((o) => (
                  <li key={o.reason} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Code>{o.reason}</Code>
                    <span className="text-xs">seen {o.firstSeen === o.lastSeen ? day(o.firstSeen) : `${day(o.firstSeen)} – ${day(o.lastSeen)}`}</span>
                    <Button size="sm" onClick={() => setDraft({ name: o.reason, code: "", aliases: "", category: Category.EvcsFault, isNew: true })}>
                      Create rule
                    </Button>
                  </li>
                ))}
              </ul>
            </Callout>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
            <Panel
              title="Stop reason mapping"
              description={`${q.data.rules.length} rules · step 3 of the procedure`}
              actions={
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-7 w-40 pl-8 text-xs" aria-label="Search rules" />
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}><RotateCcw /> Reset to spec</Button>
                </>
              }
              bodyClassName="pb-0"
            >
              <Table>
                <thead>
                  <tr>
                    <TH className="w-[88px]">Code</TH>
                    <TH>Stop reason</TH>
                    <TH>Classification</TH>
                    <TH>Source</TH>
                    <TH className="w-[72px]"><span className="sr-only">Actions</span></TH>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <TR key={r.name} className="group">
                      <TD>{r.code ? <Code>{r.code}</Code> : <span className="text-xs text-ink-3">legacy</span>}</TD>
                      <TD>
                        <span className="font-medium">{r.name}</span>
                        {r.aliases.length > 0 && <span className="ml-2 text-xs text-ink-3">also {r.aliases.join(", ")}</span>}
                      </TD>
                      <TD><CategoryTag category={r.category} /></TD>
                      <TD>
                        {r.source === "spec" && r.updatedBy === "spec v2.0" ? (
                          <span className="text-xs whitespace-nowrap text-ink-3">Spec v2.0</span>
                        ) : (
                          <span className="text-xs whitespace-nowrap text-ink-2" title={dateTime(r.updatedAt)}>
                            {r.source === "spec" ? "Edited" : "Added"}{r.updatedBy !== "anonymous" ? ` by ${r.updatedBy}` : ""}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100">
                          <button
                            onClick={() => setDraft({ name: r.name, code: r.code ?? "", aliases: r.aliases.join(", "), category: r.category, isNew: false })}
                            className="rounded p-1 text-ink-3 hover:bg-panel-2 hover:text-ink" aria-label={`Edit ${r.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => setToDelete(r)} className="rounded p-1 text-ink-3 hover:bg-panel-2 hover:text-danger" aria-label={`Delete ${r.name}`}>
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                  {!rules.length && <tr><td colSpan={5} className="py-8 text-center text-[13px] text-ink-3">No rule matches “{search}”.</td></tr>}
                </tbody>
              </Table>
            </Panel>

            <div className="space-y-4">
              <Panel title="Procedure" description="Evaluated top to bottom; the first match wins">
                <Procedure />
              </Panel>
              <Panel title="Recent changes" bodyClassName={q.data.changes.length ? "pb-2" : undefined}>
                {q.data.changes.length === 0 ? (
                  <p className="text-xs text-ink-3">No changes since the rules were seeded from the spec.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {q.data.changes.slice(0, 12).map((c, i) => (
                      <li key={i} className="py-1.5 text-xs">
                        <span className="font-medium text-ink">{c.name}</span>{" "}
                        <span className="text-ink-2">{c.action === "create" ? "added" : c.action === "update" ? "edited" : c.action === "delete" ? "deleted" : "reset to spec"}</span>
                        <div className="text-ink-3">{c.by !== "anonymous" ? `${c.by} · ` : ""}{dateTime(c.at)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>

          <FirmwareSection />
        </Page>
      )}

      <RuleDialog draft={draft} onClose={() => setDraft(null)} />

      <Dialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        width="sm"
        title={toDelete ? `Delete ${toDelete.name}?` : ""}
        description="Transactions with this stop reason become Unclassified across all history."
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancel</Button>
            <Button variant="danger" disabled={dst.isLoading} onClick={async () => {
              if (!toDelete) return;
              try {
                await deleteRule(toDelete.name).unwrap();
              } catch (e) {
                setErr(errorMessage(e));
              }
              setToDelete(null);
            }}>Delete rule</Button>
          </>
        }
      />
      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        width="sm"
        title="Reset rules to the spec?"
        description="Replaces the mapping with the 28 rules of business spec v2.0. Added and edited rules are removed; history is re-classified."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" disabled={rst.isLoading} onClick={async () => {
              try {
                await resetRules().unwrap();
              } catch (e) {
                setErr(errorMessage(e));
              }
              setConfirmReset(false);
            }}>Reset rules</Button>
          </>
        }
      />
    </>
  );
}
