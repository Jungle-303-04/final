import { Columns3, GitBranch, Maximize2 } from "lucide-react";
import { memo } from "react";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";

interface DeploymentBlueprintHeaderProps {
  clusterCount: number;
  onAlign: () => void;
  onFit: () => void;
  sourceCount: number;
}

export const DeploymentBlueprintHeader = memo(function DeploymentBlueprintHeader({
  clusterCount,
  onAlign,
  onFit,
  sourceCount,
}: DeploymentBlueprintHeaderProps) {
  const { formatNumber, t } = useI18n();

  return (
    <header className="flex min-w-0 flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-300">
            <GitBranch aria-hidden="true" className="size-4" />
          </span>
          <h3 className="text-sm font-semibold">{t("workflows.blueprint.title")}</h3>
          <Badge variant="secondary">
            {t("workflows.blueprint.sourceCount", { count: formatNumber(sourceCount) })}
          </Badge>
          <Badge variant="outline">
            {t("workflows.blueprint.clusterCount", { count: formatNumber(clusterCount) })}
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("workflows.blueprint.description")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button onClick={onFit} size="sm" type="button" variant="outline">
          <Maximize2 aria-hidden="true" />
          {t("workflows.blueprint.fit")}
        </Button>
        <Button onClick={onAlign} size="sm" type="button" variant="outline">
          <Columns3 aria-hidden="true" />
          {t("workflows.blueprint.align")}
        </Button>
      </div>
    </header>
  );
});

DeploymentBlueprintHeader.displayName = "DeploymentBlueprintHeader";
