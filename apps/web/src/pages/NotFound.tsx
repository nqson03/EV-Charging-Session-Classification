import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/states";
import { Page } from "../layout/PageHeader";

export function NotFoundPage() {
  return (
    <Page>
      <EmptyState title="Page not found" action={<Link to="/"><Button>Back to overview</Button></Link>}>
        The address doesn’t match any page.
      </EmptyState>
    </Page>
  );
}
