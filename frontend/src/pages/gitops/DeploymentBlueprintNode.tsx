import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Code2, GitFork, Server } from "lucide-react";
import { memo } from "react";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import type { DeploymentBlueprintNode } from "./deploymentBlueprintTypes";

const blueprintPortClassName = cn(
  "!size-3 !rounded-full !border-[3px] !border-zinc-900 !bg-white !shadow-[0_1px_2px_rgba(0,0,0,0.16)]",
  "after:absolute after:-inset-2 after:rounded-full after:content-['']",
  "transition-[background-color,box-shadow] duration-150 hover:!bg-zinc-100 hover:!shadow-[0_2px_4px_rgba(0,0,0,0.2)]",
  "z-20 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-zinc-900/30",
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
  const statusLabel = nodeStatusLabel(data, isRepository, isDeployment, online, t);

  return (
    <article
      aria-label={isRepository
        ? t("workflows.blueprint.sourceNode", { name: data.title || t("workflows.blueprint.emptySource") })
        : isDeployment
          ? t("workflows.blueprint.deploymentNode", { name: data.title || t("workflows.blueprint.emptyDeployment") })
          : t("workflows.blueprint.clusterNode", { name: data.title || t("workflows.blueprint.emptyCluster") })}
      className={cn(
        "relative w-72 overflow-visible rounded-2xl border p-1.5 font-sans text-zinc-950 shadow-[0_3px_10px_rgba(0,0,0,0.08)]",
        "transition-[border-color,box-shadow] duration-150 hover:shadow-[0_5px_14px_rgba(0,0,0,0.11)]",
        isRepository && "border-[#bfd2f1] bg-[#dce9fb]",
        isDeployment && "border-[#efc8ad] bg-[#fce7d8]",
        !isRepository && !isDeployment && "border-zinc-300 bg-[#e7e7e7]",
        selected && "border-zinc-800/70 shadow-[0_5px_16px_rgba(0,0,0,0.13)] ring-1 ring-zinc-900/15",
        data.placeholder && "border-dashed opacity-70",
      )}
    >
      <header className={cn(
        "flex h-8 items-center gap-2 px-2",
        !isRepository && "pl-7",
        data.kind !== "cluster" && "pr-7",
      )}>
        <span className={cn(
          "min-w-0 flex-1 truncate text-xs font-semibold",
          isRepository ? "text-[#294f87]" : isDeployment ? "text-[#8b4b22]" : "text-zinc-800",
        )}>
          {isRepository
            ? t("workflows.blueprint.source")
            : isDeployment
              ? t("workflows.blueprint.deployment")
              : t("workflows.blueprint.cluster")}
        </span>

        {!isRepository && !isDeployment ? (
          <span
            aria-label={statusLabel}
            className={cn(
              "max-w-20 truncate rounded-full border bg-white/70 px-2 py-0.5 text-[0.625rem] font-semibold leading-4",
              online
                ? "border-emerald-200 text-emerald-700"
                : critical
                  ? "border-red-200 text-red-700"
                  : "border-amber-200 text-amber-700",
            )}
            title={statusLabel}
          >
            {statusLabel}
          </span>
        ) : null}
      </header>

      <div className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex h-9 items-center gap-2 border-b border-zinc-200 px-3">
          <span className="grid size-4 shrink-0 place-items-center text-zinc-700">
            {isRepository
              ? <GitFork aria-hidden="true" className="size-3.5" />
              : isDeployment
                ? <Code2 aria-hidden="true" className="size-3.5" />
                : <Server aria-hidden="true" className="size-3.5" />}
          </span>
          <h3 className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold leading-5 tracking-[-0.015em] text-zinc-950">
            {data.title || (isRepository
              ? t("workflows.blueprint.emptySource")
              : isDeployment
                ? t("workflows.blueprint.emptyDeployment")
                : t("workflows.blueprint.emptyCluster"))}
          </h3>
        </div>

        <div className="px-3 py-1.5">
          <NodeFact
            label={isRepository
              ? t("workflows.blueprint.repository")
              : isDeployment
                ? t("workflows.blueprint.manifest")
                : t("workflows.blueprint.clusterId")}
            value={isDeployment ? data.manifestPath || data.subtitle : data.subtitle}
          />
          <NodeFact
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
      </div>

      {data.kind !== "cluster" && !data.placeholder ? (
        <Handle
          aria-label={t("workflows.blueprint.deployPort")}
          className={blueprintPortClassName}
          id="output"
          position={Position.Right}
          style={{ right: "-0.375rem", top: "1.375rem", transform: "translateY(-50%)" }}
          title={t("workflows.blueprint.deployPort")}
          type="source"
        />
      ) : null}
      {data.kind !== "repository" && !data.placeholder ? (
        <Handle
          aria-label={t("workflows.blueprint.targetPort")}
          className={blueprintPortClassName}
          id="input"
          position={Position.Left}
          style={{ left: "-0.375rem", top: "1.375rem", transform: "translateY(-50%)" }}
          title={t("workflows.blueprint.targetPort")}
          type="target"
        />
      ) : null}
    </article>
  );
});

DeploymentBlueprintNodeCard.displayName = "DeploymentBlueprintNodeCard";

function NodeFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 py-1 text-xs leading-5">
      <span className="font-sans font-semibold text-zinc-500">{label}</span>
      <span className="truncate text-right font-sans font-semibold tracking-[-0.01em] text-zinc-950" title={value}>{value}</span>
    </div>
  );
}

function nodeStatusLabel(
  data: DeploymentBlueprintNode["data"],
  isRepository: boolean,
  isDeployment: boolean,
  online: boolean,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (isRepository) {
    return data.connected ? t("workflows.blueprint.connected") : t("workflows.blueprint.unassigned");
  }
  if (isDeployment) {
    return data.connected
      ? t("workflows.blueprint.targetCount", { count: data.connectionCount || 0 })
      : t("workflows.blueprint.unassigned");
  }
  return online ? t("workflows.blueprint.online") : data.connectionStatus || t("workflows.blueprint.unknown");
}
