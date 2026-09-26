import { ArrowRight, Database } from "lucide-react";
import { Link } from "react-router";
import type { Summary } from "@evsa/core";
import { Page } from "../layout/PageHeader";
import { int, plural } from "../lib/format";
import { Button } from "./ui/button";
import { Callout } from "./ui/callout";
import { EmptyState, ErrorNote, Skeleton } from "./ui/states";

export function UnclassifiedBanner({ summary }: { summary: Summary }) {
  if (summary.unclassified === 0) return null;
  const labels = summary.unclassifiedReasons.map((r) => `${r.label} (${int(r.count)})`).join(", ");
  return (
    <Callout
      tone="warn"
      title={`${plural(summary.unclassified, "transaction")} ${summary.unclassified === 1 ? "has" : "have"} a stop reason with no rule`}
      action={
        <Link to="/rules">
          <Button size="sm" variant="secondary">Review rules <ArrowRight /></Button>
        </Link>
      }
    >
      {labels}. Counted as failed, excluded from the KPI table until a rule is added. Adding the rule re-classifies all history.
    </Callout>
  );
}

export function NoData() {
  return (
    <Page>
      <div className="rounded-md border border-line bg-panel">
        <EmptyState
          icon={<Database />}
          title="No data uploaded yet"
          action={<Link to="/data"><Button variant="primary">Upload a daily file</Button></Link>}
        >
          Upload a transaction export (.xlsx or .csv). It is classified with the current rules and added to the history.
        </EmptyState>
      </div>
    </Page>
  );
}

export function LoadingPage() {
  return (
    <Page>
      <Skeleton className="h-[92px] w-full" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[320px] lg:col-span-2" />
        <Skeleton className="h-[320px]" />
      </div>
    </Page>
  );
}

export function ErrorPage({ message }: { message: string }) {
  return (
    <Page>
      <ErrorNote>{message}</ErrorNote>
    </Page>
  );
}
