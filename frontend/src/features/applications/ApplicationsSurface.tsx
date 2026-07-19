import { Boxes, GitBranch } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { buttonVariants } from "../../shared/ui/primitives/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../shared/ui/primitives/empty";
import { ApplicationDetailWorkspace, openApplicationDetail } from "./ApplicationDetailWorkspace";
import { ApplicationsFailureState, ApplicationsRefreshControl } from "./ApplicationsState";
import { ApplicationsTable } from "./ApplicationsTable";
import { applicationCatalogFilterFromState } from "./applicationFilters";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import type { ApplicationsPort } from "./applicationsContract";
import { useApplicationCatalog } from "./useApplicationsData";
import { useUnifiedFilter } from "../filters/UnifiedFilterProvider";

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
  const catalogFilter = useMemo(
    () => applicationCatalogFilterFromState(filter.state),
    [filter.state],
  );
  const [catalog, refresh] = useApplicationCatalog(port, catalogFilter);

  if (catalog.phase === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (catalog.phase === "failed") return <ApplicationsFailureState failure={catalog.failure} onRetry={refresh} />;
  const open = (applicationId: string) => openApplicationDetail(filter, applicationId);
  return (
    <ProductPageFrame aria-busy={catalog.refreshing} className="pt-0">
      {catalog.data.length === 0 ? (
        <ApplicationsEmptyState href={repositoryConnectionHref(filter)} />
      ) : (
        <ApplicationsTable
          applications={catalog.data}
          onOpen={open}
          refreshControl={<ApplicationsRefreshControl onRefresh={refresh} resource={catalog} />}
        />
      )}
    </ProductPageFrame>
  );
}

function ApplicationsEmptyState({ href }: { href: string }) {
  const { t } = useI18n();
  const copy = applicationsCopy(t);
  return (
    <Empty className="min-h-80 rounded-xl border bg-card px-6 py-12 shadow-sm">
      <EmptyMedia className="bg-primary/10 text-primary" variant="icon">
        <Boxes aria-hidden="true" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{copy.empty}</EmptyTitle>
        <EmptyDescription className="max-w-lg text-pretty leading-6">
          {copy.emptyDescription}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link className={buttonVariants()} to={href}>
          <GitBranch aria-hidden="true" />
          {copy.connectInGitOps}
        </Link>
      </EmptyContent>
    </Empty>
  );
}

function repositoryConnectionHref(filter: ReturnType<typeof useUnifiedFilter>): string {
  return filter.navigationHref("/deploy", {
    ...filter.detail,
    surfaceTab: "repositories",
  });
}
