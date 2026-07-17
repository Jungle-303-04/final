import { GitBranch, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { OperationStatusFeedback } from "../../features/operations/OperationStatusFeedback";
import { useOptionalOperationStatusStore } from "../../features/operations/OperationStatusStore";
import { gitOpsResourceDetailPath } from "../../features/gitops/gitOpsResourceDetailRoute";
import type {
  GitOpsPort,
  GitOpsResourceAction,
  GitOpsResourceInsights,
  GitOpsResourceLocator,
  GitOpsResourceTree,
} from "../../features/gitops/gitOpsContract";
import type { CommandReceipt } from "../../shared/parity/referenceParity";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Surface } from "../../shared/ui/Surface";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Button, buttonVariants } from "../../shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import { Label } from "../../shared/ui/primitives/label";
import { WorkflowInlineHeading } from "./WorkflowInlineHeading";
import { RcaContextPanel } from "../../features/issues/RcaContextPanel";
import { EMPTY_RCA_CONTEXT_PORT, type RcaContextPort } from "../../features/issues/rcaContextContract";

export function GitOpsResourceDetailPage({ locator, port, rcaContextPort = EMPTY_RCA_CONTEXT_PORT }: {
  locator: GitOpsResourceLocator;
  port: GitOpsPort;
  rcaContextPort?: RcaContextPort;
}) {
  const { t } = useI18n();
  const operationStore = useOptionalOperationStatusStore();
  const [revision, setRevision] = useState(0);
  const [tree, setTree] = useState<GitOpsResourceTree | null>(null);
  const [insights, setInsights] = useState<GitOpsResourceInsights | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [action, setAction] = useState<GitOpsResourceAction | null>(null);
  const [receipt, setReceipt] = useState<CommandReceipt | null>(null);
  const [reason, setReason] = useState("");
  const [syncRevision, setSyncRevision] = useState("");
  const [prune, setPrune] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [force, setForce] = useState(false);
  const [applyOnly, setApplyOnly] = useState(false);
  const [hardRefresh, setHardRefresh] = useState(false);
  const [syncOptions, setSyncOptions] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const reload = useCallback(() => {
    setFailed(false);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!port.getResourceTree || !port.getResourceInsights) {
      return;
    }
    const controller = new AbortController();
    void Promise.all([
      port.getResourceTree(locator, controller.signal),
      port.getResourceInsights(locator, controller.signal),
    ]).then(([nextTree, nextInsights]) => {
      setTree(nextTree);
      setInsights(nextInsights);
    }).catch((error: unknown) => {
      if (!isAbortError(error)) setFailed(true);
    });
    return () => controller.abort();
  }, [locator, port, revision]);

  const selectedResources = useMemo(() => (
    (tree?.nodes ?? [])
      .filter((node) => node.role !== "root" && selectedNodeIds.has(node.id))
      .map((node) => ({
        apiGroup: node.resource.apiGroup,
        kind: node.resource.kind,
        namespace: node.resource.namespace,
        name: node.resource.name,
      }))
  ), [selectedNodeIds, tree]);

  if (!port.getResourceTree || !port.getResourceInsights || (failed && (!tree || !insights))) {
    return <ProductStateScreen kind="error" issue={{ code: "unknown" }} placement="content" retry={{ onRetry: reload, pending: false }} />;
  }
  if (!tree || !insights) return <ProductStateScreen kind="loading" placement="content" />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!action || !port.executeResourceAction || pending || !reason.trim()) return;
    setPending(true);
    try {
      const next = await port.executeResourceAction(locator, {
        action,
        confirmation: true,
        idempotencyKey: crypto.randomUUID(),
        insights,
        reason: reason.trim(),
        ...(action === "refresh" ? { refreshMode: hardRefresh ? "hard" as const : "normal" as const } : {}),
        ...(action === "sync" ? {
          options: {
            revision: syncRevision.trim() || undefined,
            prune,
            dryRun,
            force,
            applyOnly,
            syncOptions: syncOptions.split(",").map((value) => value.trim()).filter(Boolean),
            resources: selectedResources,
          },
        } : {}),
      });
      setReceipt(next);
      operationStore?.start(next.commandId);
      setAction(null);
      reload();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <ProductPageFrame className="gap-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <WorkflowInlineHeading
          as="h1"
          icon={<GitBranch aria-hidden="true" />}
          title={insights.resource.name}
          variant="page"
        />
        <Button aria-label={t("common.action.refresh")} onClick={reload} size="icon" type="button" variant="outline">
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>

      {failed ? <Alert variant="destructive"><AlertDescription>{t("workflows.resource.actionFailed")}</AlertDescription></Alert> : null}
      {receipt ? (
        operationStore
          ? <OperationStatusFeedback commandId={receipt.commandId} correlationId={receipt.correlationId} />
          : <output className="text-xs text-muted-foreground">{t("workflows.resource.accepted", { id: receipt.correlationId })}</output>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Surface aria-labelledby="gitops-resource-tree-title" as="section" className="min-w-0 p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold" id="gitops-resource-tree-title">{t("workflows.resource.tree")}</h2>
            <span className="text-xs text-muted-foreground">
              {t("workflows.resource.nodeCount", { count: tree.coverage.returnedCount })}
            </span>
          </div>
          {tree.coverage.state === "partial" ? (
            <Alert className="mt-3"><AlertDescription>{t("workflows.resource.treePartial")}</AlertDescription></Alert>
          ) : null}
          <ul className="mt-3 grid min-w-0 gap-2">
            {tree.nodes.map((node) => (
              <li className="flex min-w-0 items-center gap-3 rounded-lg border p-3" key={node.id}>
                {node.role !== "root" ? (
                  <input
                    aria-label={t("workflows.resource.selectNode", { name: node.resource.name })}
                    checked={selectedNodeIds.has(node.id)}
                    onChange={(event) => setSelectedNodeIds((previous) => {
                      const next = new Set(previous);
                      if (event.target.checked) next.add(node.id);
                      else next.delete(node.id);
                      return next;
                    })}
                    type="checkbox"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{node.resource.kind} · {node.resource.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {node.resource.namespace ?? t("common.value.unavailable")} · {node.role}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{node.health ?? node.status ?? t("common.value.unavailable")}</span>
                {childGitOpsDetailPath(node, tree.scope.clusterId) ? (
                  <Link
                    className={buttonVariants({ size: "sm", variant: "ghost" })}
                    to={childGitOpsDetailPath(node, tree.scope.clusterId) ?? ""}
                  >
                    {t("workflows.resource.openNode", { name: node.resource.name })}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Surface>

        <div className="grid min-w-0 content-start gap-4">
          <Surface aria-labelledby="gitops-resource-insights-title" as="section" className="min-w-0 p-4">
            <h2 className="text-sm font-semibold" id="gitops-resource-insights-title">{t("workflows.resource.insights")}</h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <Fact label={t("workflows.detail.status")} value={insights.status} />
              <Fact label={t("workflows.resource.health")} value={insights.health} />
              <Fact label={t("workflows.sync.table.revision")} value={insights.revision} />
              <Fact label={t("workflows.detail.source")} value={insights.source?.name ?? null} />
            </dl>
          </Surface>
          <Surface aria-labelledby="gitops-resource-capabilities-title" as="section" className="min-w-0 p-4">
            <h2 className="text-sm font-semibold" id="gitops-resource-capabilities-title">{t("workflows.detail.capabilities")}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {insights.capabilities.actions.map((item) => (
                <Button key={item} onClick={() => { setReason(""); setAction(item); }} size="sm" type="button" variant="outline">
                  {actionLabel(item, t)}
                </Button>
              ))}
            </div>
          </Surface>
          {insights.history.length ? (
            <Surface aria-labelledby="gitops-resource-history-title" as="section" className="min-w-0 p-4">
              <h2 className="text-sm font-semibold" id="gitops-resource-history-title">{t("workflows.resource.history")}</h2>
              <ul className="mt-3 grid gap-2">
                {insights.history.map((entry, index) => (
                  <li className="min-w-0 rounded-lg border p-3 text-sm" key={entry.id ?? `${entry.revision ?? "revision"}-${index}`}>
                    <p className="truncate font-medium">{entry.revision ?? t("common.value.unavailable")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.phase ?? t("common.value.unavailable")} · {entry.deployedAt ?? t("common.value.unavailable")}</p>
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}
        </div>
      </div>

      <RcaContextPanel
        port={rcaContextPort}
        subject={{ kind: "resource", scope: insights.scope, resource: insights.resource }}
      />

      <Dialog onOpenChange={(open) => { if (!open && !pending) setAction(null); }} open={action !== null}>
        <DialogContent>
          <form onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>{action ? actionLabel(action, t) : t("workflows.resource.action")}</DialogTitle>
              <DialogDescription>{t("workflows.resource.confirm")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Label className="grid gap-2">
                <span>{t("workflows.resource.reason")}</span>
                <Input onChange={(event) => setReason(event.target.value)} required value={reason} />
              </Label>
              {action === "sync" ? <>
                <Label className="grid gap-2">
                  <span>{t("workflows.sync.table.revision")}</span>
                  <Input onChange={(event) => setSyncRevision(event.target.value)} value={syncRevision} />
                </Label>
                <Label className="grid gap-2">
                  <span>{t("workflows.resource.syncOptions")}</span>
                  <Input onChange={(event) => setSyncOptions(event.target.value)} value={syncOptions} />
                </Label>
                <Toggle checked={prune} label={t("workflows.resource.prune")} onChange={setPrune} />
                <Toggle checked={dryRun} label={t("workflows.resource.dryRun")} onChange={setDryRun} />
                <Toggle checked={force} label={t("workflows.resource.force")} onChange={setForce} />
                <Toggle checked={applyOnly} label={t("workflows.resource.applyOnly")} onChange={setApplyOnly} />
              </> : null}
              {action === "refresh" ? (
                <Toggle checked={hardRefresh} label={t("workflows.resource.hardRefresh")} onChange={setHardRefresh} />
              ) : null}
            </div>
            <DialogFooter>
              <Button disabled={pending} onClick={() => setAction(null)} type="button" variant="outline">{t("common.action.cancel")}</Button>
              <Button disabled={pending || !reason.trim()} type="submit">{t("common.action.confirm")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ProductPageFrame>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  const { t } = useI18n();
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value ?? t("common.value.unavailable")}</dd></div>;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange(value: boolean): void }) {
  return <Label className="flex items-center gap-2"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>{label}</span></Label>;
}

function actionLabel(action: GitOpsResourceAction, t: ReturnType<typeof useI18n>["t"]): string {
  switch (action) {
    case "reconcile": return t("workflows.resource.action.reconcile");
    case "sync_with_source": return t("workflows.resource.action.sync_with_source");
    case "suspend": return t("workflows.resource.action.suspend");
    case "resume": return t("workflows.resource.action.resume");
    case "sync": return t("workflows.resource.action.sync");
    case "refresh": return t("workflows.resource.action.refresh");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

const CHILD_GITOPS_IDENTITIES = new Set([
  "argoproj.io/application",
  "kustomize.toolkit.fluxcd.io/kustomization",
  "helm.toolkit.fluxcd.io/helmrelease",
  "source.toolkit.fluxcd.io/gitrepository",
  "source.toolkit.fluxcd.io/ocirepository",
  "source.toolkit.fluxcd.io/helmrepository",
  "source.toolkit.fluxcd.io/bucket",
  "source.toolkit.fluxcd.io/helmchart",
]);

function childGitOpsDetailPath(
  node: GitOpsResourceTree["nodes"][number],
  clusterId: string,
): string | null {
  if (node.role === "root" || node.resource.namespace === null) return null;
  const identity = `${node.resource.apiGroup}/${node.resource.kind.toLowerCase()}`;
  if (!CHILD_GITOPS_IDENTITIES.has(identity)) return null;
  return gitOpsResourceDetailPath({
    clusterId,
    apiVersion: node.resource.apiGroup
      ? `${node.resource.apiGroup}/${node.resource.version}`
      : node.resource.version,
    kind: node.resource.kind,
    namespace: node.resource.namespace,
    name: node.resource.name,
  });
}
