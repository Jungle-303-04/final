import { Server } from "lucide-react";
import { useI18n, type MessageKey } from "../../shared/i18n";
import {
  ClusterConnectionMark,
  clusterDisplayLabel,
  connectionLabelKey,
  formatClusterObservation,
} from "../../shared/ui/ClusterConnectionStatus";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui/primitives/tooltip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import { useClusterScope } from "./ClusterScopeProvider";
import { ClusterProviderIcon } from "./ClusterProviderIcon";
import type { HomeConnectionStage } from "../home/homeContract";

const ALL_CLUSTERS_VALUE = "__all_clusters__";

export function ClusterScopePicker() {
  const { formatDate, formatNumber, t } = useI18n();
  const scope = useClusterScope();
  const fixedGeometry = "h-8 w-full min-w-0 max-w-(--product-cluster-select-width)";

  if (scope.collection.phase === "idle" || scope.collection.phase === "loading") {
    return (
      <div
        aria-label={t("clusterScope.loading")}
        className={fixedGeometry}
        data-slot="cluster-scope-picker"
        role="status"
      >
        <Skeleton aria-hidden="true" className="size-full" />
      </div>
    );
  }

  if (scope.collection.phase === "failed" || scope.collection.data.clusters.length === 0) {
    const label = scope.collection.phase === "failed"
      ? t("clusterScope.unavailable")
      : t("clusterScope.empty");
    return (
      <button
        aria-label={label}
        className={`${fixedGeometry} rounded-lg border border-input bg-background px-2.5 text-left text-sm text-muted-foreground disabled:opacity-50`}
        data-slot="cluster-scope-picker"
        disabled
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Server aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
      </button>
    );
  }

  const selected = scope.selectedCluster;
  const items = [
    { label: t("clusterScope.all"), value: ALL_CLUSTERS_VALUE },
    ...scope.collection.data.clusters.map((cluster) => ({
      label: clusterDisplayLabel(cluster),
      value: cluster.id,
    })),
  ];
  const selectedConnection = selected
    ? t(connectionLabelKey(selected.connectionState))
    : t("common.state.unknown");
  const selectedStage = selected?.connectionStage
    ? t(connectionStageLabelKey(selected.connectionStage))
    : null;
  const selectedObservation = formatClusterObservation(
    selected?.lastObservedAt ?? null,
    formatDate,
    t("common.state.unknown"),
  );
  const selectedLabel = selected
    ? clusterDisplayLabel(selected)
    : selectionLabel(scope, formatNumber, t);
  const selectedAccessibleLabel = !selected
    ? selectedLabel
    : selectedStage
      ? t("clusterScope.ariaWithStage", {
          cluster: selectedLabel,
          connection: selectedConnection,
          stage: selectedStage,
        })
      : t("clusterScope.aria", {
          cluster: selectedLabel,
          connection: selectedConnection,
        });

  return (
    <div className={fixedGeometry} data-slot="cluster-scope-picker">
      <Select
        items={items}
        onValueChange={(value) => {
          if (value === ALL_CLUSTERS_VALUE) scope.clearClusters();
          else if (value) scope.toggleCluster(value);
        }}
        value={selected?.id ?? null}
      >
        <Tooltip>
          <TooltipTrigger
            render={(
              <SelectTrigger
                aria-invalid={scope.selection.kind === "unknown" || (
                  scope.selection.kind === "multiple" && scope.selection.unresolvedIds.length > 0
                ) || undefined}
                aria-label={selectedAccessibleLabel}
                className="size-full min-w-0"
                title={selectedLabel}
              />
            )}
          >
            {selected ? (
              <>
                <ClusterProviderIcon provider={selected.provider} />
                <ClusterConnectionMark compact connectionState={selected.connectionState} />
              </>
            ) : (
              <Server aria-hidden="true" />
            )}
            <SelectValue className="truncate" placeholder={selectedLabel} />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {selected ? <span className="flex flex-col gap-1">
              {selectedStage ? (
                <span>{t("clusterScope.stage.summary", { stage: selectedStage })}</span>
              ) : null}
              <span>{t("home.lastObserved", { time: selectedObservation })}</span>
            </span> : <span>{selectedLabel}</span>}
          </TooltipContent>
        </Tooltip>
        <SelectContent align="start" alignItemWithTrigger={false} className="max-w-[min(32rem,calc(100vw-2rem))]">
          <SelectGroup>
            <SelectLabel>{t("clusterScope.available")}</SelectLabel>
            <SelectItem value={ALL_CLUSTERS_VALUE}>
              <span className="flex min-w-0 items-center gap-2">
                <Server aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{t("clusterScope.all")}</span>
              </span>
            </SelectItem>
            {scope.collection.data.clusters.map((cluster) => (
              <SelectItem key={cluster.id} value={cluster.id}>
                <span className="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
                  <span className="flex min-w-0 items-center gap-2">
                    <ClusterProviderIcon provider={cluster.provider} />
                    <span className="truncate" title={clusterDisplayLabel(cluster)}>
                      {clusterDisplayLabel(cluster)}
                    </span>
                  </span>
                  <ClusterConnectionMark compact connectionState={cluster.connectionState} />
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function selectionLabel(
  scope: ReturnType<typeof useClusterScope>,
  formatNumber: (value: number | bigint) => string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (scope.selection.kind === "unfiltered") return t("clusterScope.all");
  if (scope.selection.kind === "multiple") {
    if (scope.selection.unresolvedIds.length > 0) {
      return t("clusterScope.multiplePartial", {
        count: formatNumber(scope.selection.requestedIds.length),
        resolved: formatNumber(scope.selection.clusters.length),
      });
    }
    return t("clusterScope.multiple", {
      count: formatNumber(scope.selection.requestedIds.length),
    });
  }
  if (scope.selection.kind === "unknown") {
    return t("clusterScope.currentUnavailable", { cluster: scope.selection.requestedId });
  }
  return t("clusterScope.select");
}

const connectionStageLabelKeys: Record<HomeConnectionStage, MessageKey> = {
  token_issued: "clusterScope.stage.tokenIssued",
  awaiting_install: "clusterScope.stage.awaitingInstall",
  agent_connected: "clusterScope.stage.agentConnected",
  snapshot_received: "clusterScope.stage.snapshotReceived",
  ready: "clusterScope.stage.ready",
  expired: "clusterScope.stage.expired",
  error: "clusterScope.stage.error",
};

function connectionStageLabelKey(stage: HomeConnectionStage): MessageKey {
  return connectionStageLabelKeys[stage];
}
