import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { RcaContextPanel } from "../../features/issues/RcaContextPanel";
import type { RcaContextPort } from "../../features/issues/rcaContextContract";
import { OperationStatusFeedback } from "../../features/operations/OperationStatusFeedback";
import { useOptionalOperationStatusStore } from "../../features/operations/OperationStatusStore";
import type {
  GitOpsPort,
  GitOpsResourceAction,
  GitOpsResourceInsights,
  GitOpsResourceLocator,
  GitOpsResourceTree,
} from "../../features/gitops/gitOpsContract";
import type { CommandReceipt } from "../../shared/parity/referenceParity";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Button } from "../../shared/ui/primitives/button";
import { GitOpsResourceActionDialog, gitOpsActionLabel } from "./GitOpsResourceActionDialog";
import { GitOpsResourceInsight } from "./GitOpsResourceInsight";
import { GitOpsResourceInventory } from "./GitOpsResourceInventory";

type ResourceFrame =
  | { key: string; phase: "loading" }
  | { key: string; phase: "failed" }
  | { insights: GitOpsResourceInsights; key: string; phase: "ready"; tree: GitOpsResourceTree };

export function GitOpsResourceWorkspace({
  locator: rootLocator,
  port,
  rcaContextPort,
}: {
  locator: GitOpsResourceLocator;
  port: GitOpsPort;
  rcaContextPort: RcaContextPort;
}) {
  const { t } = useI18n();
  const operationStore = useOptionalOperationStatusStore();
  const [action, setAction] = useState<GitOpsResourceAction | null>(null);
  const [activeLocator, setActiveLocator] = useState(rootLocator);
  const [receipt, setReceipt] = useState<CommandReceipt | null>(null);
  const [request, setRequest] = useState(0);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const rootKey = locatorKey(rootLocator);
  const activeKey = locatorKey(activeLocator);
  const requestKey = `${activeKey}:${request}`;
  const [frame, setFrame] = useState<ResourceFrame>({ key: requestKey, phase: "loading" });
  const reload = useCallback(() => setRequest((value) => value + 1), []);

  useEffect(() => {
    if (!port.getResourceTree || !port.getResourceInsights) return;
    const controller = new AbortController();
    void Promise.all([
      port.getResourceTree(activeLocator, controller.signal),
      port.getResourceInsights(activeLocator, controller.signal),
    ]).then(([tree, insights]) => {
      if (!controller.signal.aborted) setFrame({ insights, key: requestKey, phase: "ready", tree });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isAbortError(error)) setFrame({ key: requestKey, phase: "failed" });
    });
    return () => controller.abort();
  }, [activeLocator, port, requestKey]);

  if (!port.getResourceTree || !port.getResourceInsights) {
    return (
      <p className="m-0 rounded-lg border border-dashed border-border-subtle p-3 text-label-2 text-caption-foreground">
        {t("workflows.detail.integrationUnavailable")}
      </p>
    );
  }

  const currentFrame = frame.key === requestKey ? frame : { key: requestKey, phase: "loading" as const };
  if (currentFrame.phase === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (currentFrame.phase === "failed") {
    return (
      <ProductStateScreen
        issue={{ code: "server", safeDetail: t("workflows.sync.failure") }}
        kind="error"
        placement="content"
        retry={{ onRetry: reload, pending: false }}
      />
    );
  }

  const selectedResources = selectedResourceInputs(currentFrame.tree, selectedNodeIds);
  const accepted = (nextReceipt: CommandReceipt) => {
    setReceipt(nextReceipt);
    operationStore?.start(nextReceipt.commandId);
    reload();
  };
  return (
    <div className="grid min-w-0 animate-in gap-3 fade-in-0 duration-(--motion-soft) ease-(--ease-soft) motion-reduce:animate-none">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {activeKey !== rootKey ? (
            <Button aria-label={t("common.action.back")} onClick={() => {
              setSelectedNodeIds(new Set());
              setActiveLocator(rootLocator);
            }} size="icon-sm" type="button" variant="ghost">
              <ArrowLeft aria-hidden="true" />
            </Button>
          ) : null}
          <span className="grid min-w-0 gap-0.5">
            <strong className="truncate text-label-2">{currentFrame.insights.resource.kind} · {currentFrame.insights.resource.name}</strong>
            <span className="truncate font-mono text-caption text-caption-foreground">
              {activeLocator.clusterId} / {activeLocator.namespace}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {port.executeResourceAction ? currentFrame.insights.capabilities.actions.map((item) => (
            <Button key={item} onClick={() => setAction(item)} size="sm" type="button" variant="outline">
              {gitOpsActionLabel(item, t)}
            </Button>
          )) : (
            <span className="text-caption text-caption-foreground">{t("workflows.detail.executionUnavailable")}</span>
          )}
          <Button aria-label={t("common.action.refresh")} onClick={reload} size="icon-sm" type="button" variant="ghost">
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>
      </header>
      {receipt ? (
        operationStore ? (
          <OperationStatusFeedback commandId={receipt.commandId} correlationId={receipt.correlationId} />
        ) : (
          <output className="text-caption text-caption-foreground">{t("workflows.resource.accepted", { id: receipt.correlationId })}</output>
        )
      ) : null}
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
        <GitOpsResourceInventory
          onInspect={(node) => {
            setSelectedNodeIds(new Set());
            setActiveLocator(locatorForNode(currentFrame.tree, node));
          }}
          onToggle={(nodeId, selected) => setSelectedNodeIds((previous) => toggleSelection(previous, nodeId, selected))}
          selectedNodeIds={selectedNodeIds}
          tree={currentFrame.tree}
        />
        <GitOpsResourceInsight insights={currentFrame.insights} />
      </div>
      <RcaContextPanel
        port={rcaContextPort}
        subject={{ kind: "resource", scope: currentFrame.insights.scope, resource: currentFrame.insights.resource }}
      />
      <GitOpsResourceActionDialog
        action={action}
        insights={currentFrame.insights}
        key={action ?? "closed"}
        locator={activeLocator}
        onAccepted={accepted}
        onClose={() => setAction(null)}
        port={port}
        selectedResources={selectedResources}
      />
    </div>
  );
}

function locatorForNode(tree: GitOpsResourceTree, node: GitOpsResourceTree["nodes"][number]): GitOpsResourceLocator {
  return {
    apiVersion: node.resource.apiGroup ? `${node.resource.apiGroup}/${node.resource.version}` : node.resource.version,
    clusterId: tree.scope.clusterId,
    kind: node.resource.kind,
    name: node.resource.name,
    namespace: node.resource.namespace ?? "",
  };
}

function selectedResourceInputs(tree: GitOpsResourceTree, selected: ReadonlySet<string>) {
  return tree.nodes.filter((node) => node.role !== "root" && selected.has(node.id)).map((node) => ({
    apiGroup: node.resource.apiGroup,
    kind: node.resource.kind,
    name: node.resource.name,
    namespace: node.resource.namespace,
  }));
}

function toggleSelection(previous: ReadonlySet<string>, nodeId: string, selected: boolean): Set<string> {
  const next = new Set(previous);
  if (selected) next.add(nodeId);
  else next.delete(nodeId);
  return next;
}

function locatorKey(locator: GitOpsResourceLocator): string {
  return [locator.clusterId, locator.apiVersion, locator.kind, locator.namespace, locator.name].join(":");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
