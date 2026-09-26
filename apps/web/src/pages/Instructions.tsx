import type { ReactNode } from "react";
import { Link } from "react-router";
import { Code } from "../components/ui/badge";
import { Panel } from "../components/ui/panel";
import { Page, PageHeader } from "../layout/PageHeader";

interface Section {
  id: string;
  title: string;
  intro?: ReactNode;
  steps: ReactNode[];
  ordered?: boolean;
  note?: ReactNode;
}

const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>;

const To = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="font-semibold text-accent-ink hover:underline">{children}</Link>
);

function SubList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-1.5 list-disc space-y-1 pl-5 marker:text-ink-3">
      {items.map((x, i) => <li key={i}>{x}</li>)}
    </ul>
  );
}

const SECTIONS: Section[] = [
  {
    id: "upload",
    title: "1. Upload a daily file",
    intro: <>Each file holds <B>one day</B> of data, as <Code>.xlsx</Code> or <Code>.csv</Code>.</>,
    ordered: true,
    steps: [
      <>Go to <To to="/data">Data uploads</To>.</>,
      <>Drag the file into “Drop a daily transaction export here”, or click <B>Choose file</B>.</>,
      <>Wait while the file is read (“Reading …”). The review screen then opens.</>,
      <>
        Look at <B>Checks</B>:
        <SubList
          items={[
            <>Green tick: passed.</>,
            <>Yellow triangle: a warning; you can still save (for example, missing station or firmware columns, or rows that end on another day).</>,
            <>Red dot: an error; the file can’t be saved. The file must have the <Code>li_do_dung_sac</Code> and <Code>ma_giao_dich_tren_emsp</Code> columns.</>,
          ]}
        />
      </>,
      <>
        Check the <B>Report date</B>. It is taken from the most common day in <Code>thoi_gian_ket_thuc</Code>, or from the
        file name (such as <Code>260922_…</Code>). If neither works, pick the date yourself.
      </>,
      <>Review <B>Preview with current rules</B>: success, failed, EVCS and Non-EVCS rates, plus the Top 3 faults for this file, before saving.</>,
      <>
        Click <B>Save to history</B>. If that day already has data, the button reads <B>Replace day in history</B> and
        overwrites it. A progress bar shows how much has been sent.
      </>,
      <>When “… saved” appears, you’re done. Click <B>Upload another file</B> for the next day.</>,
    ],
    note: <>To cancel without saving, click <B>Discard</B>.</>,
  },
  {
    id: "export",
    title: "2. Download the classified file",
    steps: [
      <>
        On the review screen, click <B>Export classified .xlsx</B>. You get an Excel file named{" "}
        <Code>&lt;original name&gt;_classified.xlsx</Code>, with each transaction labelled by the current rules. The
        file is built on your computer.
      </>,
    ],
  },
  {
    id: "report",
    title: "3. View a report for a date range",
    ordered: true,
    steps: [
      <>Open <To to="/">Overview</To> or <To to="/charger-faults">Charger faults</To>.</>,
      <>Click the calendar button at the top right. Pick a preset, or enter dates under <B>Custom range</B> and click <B>Apply</B>.</>,
      <>Choose <B>Daily / Weekly / Monthly</B> to change how the charts group the numbers.</>,
      <>Hover over a chart to see the figures for each period.</>,
    ],
  },
  {
    id: "delete",
    title: "4. Delete a day",
    ordered: true,
    steps: [
      <>Go to <To to="/data">Data uploads</To> and find the day in the <B>History</B> table.</>,
      <>Click the trash icon at the end of the row.</>,
      <>Click <B>Delete day</B> to confirm.</>,
    ],
    note: <>The day disappears from every report. To bring it back, upload that day’s file again.</>,
  },
  {
    id: "add-rule",
    title: "5. Add a rule for a new stop reason",
    intro: <>When you see the warning “stop reason … has no rule”:</>,
    ordered: true,
    steps: [
      <>Go to <To to="/rules">Classification rules</To>. The yellow box at the top lists stop reasons without a rule and the days they were seen.</>,
      <>Click <B>Create rule</B> next to the reason (or <B>Add rule</B> to type one in).</>,
      <>
        Fill in:
        <SubList
          items={[
            <><B>Stop reason</B>: the reason’s name; case doesn’t matter.</>,
            <><B>Error code</B> (optional): for example <Code>SR0000</Code>.</>,
            <><B>Aliases</B>: other spellings of the same reason, separated by commas.</>,
            <><B>Classification</B>: <B>EVCS Fault</B> (charger related) or <B>Non-EVCS Fault</B> (not caused by the charger).</>,
          ]}
        />
      </>,
      <>Click <B>Save rule</B>. All stored history is re-classified straight away.</>,
    ],
  },
  {
    id: "edit-rule",
    title: "6. Edit, delete or reset rules",
    steps: [
      <><B>Edit</B>: click the pencil icon on a rule, change the code, aliases or classification, then click <B>Save rule</B>. The stop reason name can’t be changed.</>,
      <><B>Delete</B>: click the trash icon, then <B>Delete rule</B>. Transactions with that reason become <B>Unclassified</B> across all history.</>,
      <>
        <B>Reset</B>: click <B>Reset to spec</B>, then <B>Reset rules</B>. The mapping goes back to the 28 rules of
        business spec v2.0; every added or edited rule is removed.
      </>,
    ],
  },
];

export function InstructionsPage() {
  return (
    <>
      <PageHeader title="Instructions" subtitle="How to do the common tasks on this site" />
      <Page>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_200px]">
          <nav aria-label="Contents" className="lg:sticky lg:top-[76px] lg:order-2 lg:self-start">
            <div className="mb-1.5 eyebrow">Contents</div>
            <ul className="space-y-1 border-l border-line text-[13px]">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-ink-2 hover:border-ink hover:text-ink">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-4 lg:order-1">
            {SECTIONS.map((s) => {
              const List = s.ordered ? "ol" : "ul";
              return (
                <div key={s.id} id={s.id} className="scroll-mt-20">
                  <Panel title={s.title}>
                    <div className="max-w-[760px] space-y-2.5 text-[13px] leading-relaxed text-ink-2">
                      {s.intro && <p>{s.intro}</p>}
                      <List className={`space-y-1.5 pl-5 marker:text-ink-3 ${s.ordered ? "list-decimal" : "list-disc"}`}>
                        {s.steps.map((step, i) => <li key={i} className="pl-1">{step}</li>)}
                      </List>
                      {s.note && <p className="text-ink-3">{s.note}</p>}
                    </div>
                  </Panel>
                </div>
              );
            })}
          </div>
        </div>
      </Page>
    </>
  );
}
