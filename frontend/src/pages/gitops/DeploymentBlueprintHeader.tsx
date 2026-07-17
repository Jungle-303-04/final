import { ArrowLeftRight, ArrowRightFromLine, ArrowRightToLine, Columns3, GitBranch, Maximize2 } from "lucide-react";
import { memo } from "react";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
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
    <header className="flex min-w-0 flex-col gap-3 border-b px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg border border-lime-500/20 bg-lime-300/20 text-lime-800 dark:text-lime-200">
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
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label={t("workflows.blueprint.nodeTypes")}>
          <RoleChip
            className="border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-300"
            icon={<ArrowRightFromLine aria-hidden="true" />}
            label={t("workflows.blueprint.outputOnly")}
          />
          <RoleChip
            className="border-lime-500/25 bg-lime-300/10 text-lime-800 dark:text-lime-200"
            icon={<ArrowLeftRight aria-hidden="true" />}
            label={t("workflows.blueprint.inputOutput")}
          />
          <RoleChip
            className="border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
            icon={<ArrowRightToLine aria-hidden="true" />}
            label={t("workflows.blueprint.inputOnly")}
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button onClick={onFit} size="sm" type="button" variant="outline">
          <Maximize2 aria-hidden="true" />
          {t("workflows.blueprint.fit")}
        </Button>
        <Button className="bg-lime-300 text-slate-950 hover:bg-lime-200" onClick={onAlign} size="sm" type="button">
          <Columns3 aria-hidden="true" />
          {t("workflows.blueprint.align")}
        </Button>
      </div>
    </header>
  );
});

DeploymentBlueprintHeader.displayName = "DeploymentBlueprintHeader";

function RoleChip({
  className,
  icon,
  label,
}: {
  className: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[0.625rem] font-medium [&>svg]:size-3", className)}>
      {icon}
      {label}
    </span>
  );
}
