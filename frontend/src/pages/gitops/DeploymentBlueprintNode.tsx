import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileCode2, GitBranch, GitFork, Network, Server, Workflow } from "lucide-react";
import { memo } from "react";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import type { DeploymentBlueprintNode } from "./deploymentBlueprintTypes";

const blueprintPortClassName = cn(
  "!size-6 !rounded-none !border-0 !bg-transparent !shadow-none",
  "after:absolute after:left-1 after:top-[0.1875rem] after:h-[1.125rem] after:w-4 after:bg-slate-50 after:shadow-md after:content-['']",
  "after:[clip-path:polygon(0_0,68%_0,100%_50%,68%_100%,0_100%)]",
  "hover:after:brightness-110 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-white/70",
);

export const DeploymentBlueprintNodeCard = memo(function DeploymentBlueprintNodeCard({
  data,
  selected,
}: NodeProps<DeploymentBlueprintNode>) {
  const { t } = useI18n();
  const isRepository = data.kind === "repository";
  const isDeployment = data.kind === "deployment";
  const normalizedStatus = (data.connectionStatus || "").toLowerCase();
  const online = ["online", "connected", "ready"].includes(normalizedStatus);
  const critical = ["offline", "disconnected", "critical", "error"].includes(normalizedStatus);

  return (
    <article
      aria-label={isRepository
        ? t("workflows.blueprint.sourceNode", { name: data.title || t("workflows.blueprint.emptySource") })
        : isDeployment
          ? t("workflows.blueprint.deploymentNode", { name: data.title || t("workflows.blueprint.emptyDeployment") })
          : t("workflows.blueprint.clusterNode", { name: data.title || t("workflows.blueprint.emptyCluster") })}
      className={cn(
        "relative w-72 overflow-visible rounded-xl border border-slate-700/80 bg-slate-900/95 text-slate-100 shadow-xl backdrop-blur-sm",
        "transition-[border-color,box-shadow] duration-150",
        selected && "border-slate-400 shadow-2xl ring-2 ring-white/10",
        data.placeholder && "border-dashed opacity-70",
      )}
    >
      <div className={cn(
        "absolute inset-x-3 top-0 h-px",
        isRepository ? "bg-sky-300/80" : isDeployment ? "bg-violet-300/80" : "bg-emerald-300/80",
      )} />

      <header className="flex items-center gap-3 px-3.5 py-3">
        <span className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg border bg-slate-950/50",
          isRepository
            ? "border-sky-400/20 text-sky-300"
            : isDeployment
              ? "border-violet-400/20 text-violet-300"
              : "border-emerald-400/20 text-emerald-300",
        )}>
          {isRepository
            ? <GitFork aria-hidden="true" className="size-[1.125rem]" />
            : isDeployment
              ? <Workflow aria-hidden="true" className="size-[1.125rem]" />
              : <Server aria-hidden="true" className="size-[1.125rem]" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.625rem] font-medium uppercase tracking-[0.16em] text-slate-500">
            {isRepository
              ? t("workflows.blueprint.source")
              : isDeployment
                ? t("workflows.blueprint.deployment")
                : t("workflows.blueprint.cluster")}
          </p>
          <h3 className="mt-0.5 truncate text-[0.8125rem] font-semibold tracking-tight text-slate-50">
            {data.title || (isRepository
              ? t("workflows.blueprint.emptySource")
              : isDeployment
                ? t("workflows.blueprint.emptyDeployment")
                : t("workflows.blueprint.emptyCluster"))}
          </h3>
        </div>

        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-950/40 px-2 py-1 text-[0.5625rem] text-slate-400">
          <span className={cn(
            "size-1.5 rounded-full",
            isRepository
            ? data.connected ? "bg-sky-300" : "bg-slate-600"
              : isDeployment
                ? data.connected ? "bg-violet-300" : "bg-slate-600"
                : online ? "bg-emerald-400" : critical ? "bg-red-500" : "bg-amber-400",
          )} />
          {isRepository
            ? data.connected
              ? t("workflows.blueprint.connected")
              : t("workflows.blueprint.unassigned")
            : isDeployment
              ? data.connected
                ? t("workflows.blueprint.targetCount", { count: data.connectionCount || 0 })
                : t("workflows.blueprint.unassigned")
              : online ? t("workflows.blueprint.online") : data.connectionStatus || t("workflows.blueprint.unknown")}
        </span>
      </header>

      <div className="divide-y divide-slate-800/80 border-y border-slate-800/80 px-3.5">
        <NodeFact
          icon={isRepository
            ? <GitFork aria-hidden="true" />
            : isDeployment
              ? <FileCode2 aria-hidden="true" />
              : <Network aria-hidden="true" />}
          label={isRepository
            ? t("workflows.blueprint.repository")
            : isDeployment
              ? t("workflows.blueprint.manifest")
              : t("workflows.blueprint.clusterId")}
          value={isDeployment ? data.manifestPath || data.subtitle : data.subtitle}
        />
        <NodeFact
          icon={isRepository
            ? <GitBranch aria-hidden="true" />
            : isDeployment
              ? <Network aria-hidden="true" />
              : <Server aria-hidden="true" />}
          label={isRepository
            ? t("workflows.blueprint.branch")
            : isDeployment
              ? t("workflows.blueprint.targets")
              : t("workflows.blueprint.environment")}
          value={isRepository
            ? data.branch || "main"
            : isDeployment
              ? t("workflows.blueprint.targetCount", { count: data.connectionCount || 0 })
              : data.environment || "unknown"}
        />
      </div>

      <footer className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[0.625rem] text-slate-500">
        <span>{isRepository
          ? t("workflows.blueprint.dragSource")
          : isDeployment
            ? t("workflows.blueprint.routeDeployment")
            : t("workflows.blueprint.dropTarget")}</span>
        <span className="font-mono uppercase tracking-widest text-slate-400">
          {isRepository
            ? t("workflows.blueprint.portOut")
            : isDeployment
              ? t("workflows.blueprint.portInOut")
              : t("workflows.blueprint.portIn")}
        </span>
      </footer>

      {data.kind !== "cluster" && !data.placeholder ? (
        <Handle
          aria-label={t("workflows.blueprint.deployPort")}
          className={cn(blueprintPortClassName, "!right-[-0.25rem]")}
          id="output"
          position={Position.Right}
          title={t("workflows.blueprint.deployPort")}
          type="source"
        />
      ) : null}
      {data.kind !== "repository" && !data.placeholder ? (
        <Handle
          aria-label={t("workflows.blueprint.targetPort")}
          className={cn(blueprintPortClassName, "!left-[-0.25rem]")}
          id="input"
          position={Position.Left}
          title={t("workflows.blueprint.targetPort")}
          type="target"
        />
      ) : null}
    </article>
  );
});

DeploymentBlueprintNodeCard.displayName = "DeploymentBlueprintNodeCard";

function NodeFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1rem_4.25rem_minmax(0,1fr)] items-center gap-2 py-2 text-[0.6875rem]">
      <span className="text-slate-600 [&>svg]:size-3">{icon}</span>
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-mono text-[0.625rem] text-slate-300" title={value}>{value}</span>
    </div>
  );
}
