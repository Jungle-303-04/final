import { Plus, Server } from "lucide-react";
import { memo } from "react";
import type { ReleaseCluster } from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";

interface DeploymentBlueprintSidebarProps {
  clusters: ReleaseCluster[];
  hiddenClusters: ReleaseCluster[];
  onAddCluster: (clusterId: string) => void;
}

export const DeploymentBlueprintSidebar = memo(function DeploymentBlueprintSidebar({
  clusters,
  hiddenClusters,
  onAddCluster,
}: DeploymentBlueprintSidebarProps) {
  const { formatNumber, t } = useI18n();

  return (
    <aside className="flex min-w-0 items-center gap-3 border-b bg-muted/20 px-4 py-2.5">
      <div className="flex shrink-0 items-center gap-2">
        <h4 className="text-xs font-semibold">{t("workflows.blueprint.library")}</h4>
        <Badge variant="outline">{formatNumber(hiddenClusters.length)}</Badge>
      </div>

      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
        {hiddenClusters.length ? hiddenClusters.map((cluster) => (
          <button
            className="group flex w-52 shrink-0 items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-left transition-colors hover:border-primary/50 hover:bg-accent"
            key={cluster.id}
            onClick={() => onAddCluster(cluster.id)}
            type="button"
          >
            <span className="grid size-7 place-items-center rounded-md bg-lime-500/10 text-lime-700 dark:text-lime-300">
              <Server aria-hidden="true" className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{cluster.name}</span>
              <span className="block truncate text-[0.625rem] text-muted-foreground">
                {cluster.environment}
              </span>
            </span>
            <Plus aria-hidden="true" className="ml-auto size-4 text-muted-foreground group-hover:text-primary" />
          </button>
        )) : (
          <p className="min-w-0 truncate text-[0.6875rem] text-muted-foreground">
            {clusters.length ? t("workflows.blueprint.allPlaced") : t("workflows.blueprint.noClusters")}
          </p>
        )}
      </div>
    </aside>
  );
});

DeploymentBlueprintSidebar.displayName = "DeploymentBlueprintSidebar";
