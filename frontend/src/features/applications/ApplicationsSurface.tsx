import { Grid2X2, List, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Button } from "../../shared/ui/primitives/button";
import { ApplicationCard } from "./ApplicationCard";
import { ApplicationDetailWorkspace, openApplicationDetail } from "./ApplicationDetailWorkspace";
import { ApplicationsFailureState } from "./ApplicationsState";
import { ApplicationsTable } from "./ApplicationsTable";
import { applicationCatalogFilterFromState } from "./applicationFilters";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import type { ApplicationsPort } from "./applicationsContract";
import { useApplicationCatalog } from "./useApplicationsData";
import { useUnifiedFilter } from "../filters/UnifiedFilterProvider";

type ApplicationsView = "grid" | "table";

export function ApplicationsSurface({ port }: { port: ApplicationsPort }) {
  const filter = useUnifiedFilter();
  const applicationId = filter.detail.application ?? null;
  if (applicationId !== null) {
    return <ApplicationDetailWorkspace applicationId={applicationId} filter={filter} port={port} />;
  }
  return <ApplicationsCatalog filter={filter} port={port} />;
}

function ApplicationsCatalog({
  filter,
  port,
}: {
  filter: ReturnType<typeof useUnifiedFilter>;
  port: ApplicationsPort;
}) {
  const { locale } = useI18n();
  const copy = applicationsCopy(locale);
  const [view, setView] = useState<ApplicationsView>("grid");
  const catalogFilter = useMemo(
    () => applicationCatalogFilterFromState(filter.state),
    [filter.state],
  );
  const [catalog, refresh] = useApplicationCatalog(port, catalogFilter);

  if (catalog.phase === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (catalog.phase === "failed") return <ApplicationsFailureState failure={catalog.failure} onRetry={refresh} />;
  const open = (applicationId: string) => openApplicationDetail(filter, applicationId);
  return (
    <ProductPageFrame>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Button aria-label={copy.refresh} disabled={catalog.refreshing} onClick={refresh} size="icon" type="button" variant="outline">
          <RefreshCw aria-hidden="true" className={catalog.refreshing ? "motion-safe:animate-spin" : undefined} />
        </Button>
      </header>
      <div className="flex min-w-0 items-center justify-end">
        <div className="flex items-center gap-1" role="group" aria-label={copy.title}>
          <Button aria-label={copy.gridView} aria-pressed={view === "grid"} onClick={() => setView("grid")} size="icon" type="button" variant={view === "grid" ? "secondary" : "ghost"}><Grid2X2 aria-hidden="true" /></Button>
          <Button aria-label={copy.tableView} aria-pressed={view === "table"} onClick={() => setView("table")} size="icon" type="button" variant={view === "table" ? "secondary" : "ghost"}><List aria-hidden="true" /></Button>
        </div>
      </div>
      {catalog.data.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">{copy.empty}</p>
      ) : view === "grid" ? (
        <ul className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {catalog.data.map((application) => (
            <li className="min-w-0" key={application.id}>
              <ApplicationCard application={application} onOpen={() => open(application.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <ApplicationsTable applications={catalog.data} onOpen={open} />
      )}
    </ProductPageFrame>
  );
}
