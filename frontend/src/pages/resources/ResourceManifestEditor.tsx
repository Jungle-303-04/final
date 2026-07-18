import { FilePenLine, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  ResourceManifestPortFailure,
  type ResourceManifestDeployment,
  type ResourceManifestPort,
  type ResourceManifestPreview,
  type ResourceManifestSource,
} from "../../features/resources/resourceManifestContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import {
  useOptionalOperationStatus,
  useOptionalOperationStatusStore,
  type OperationStatusSnapshot,
} from "../../features/operations/OperationStatusStore";
import { useI18n } from "../../shared/i18n";
import { UnifiedDiff } from "../../shared/ui/UnifiedDiff";
import { StatusMark, type StatusTone } from "../../shared/ui/StatusMark";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../shared/ui/primitives/sheet";
import { Input } from "../../shared/ui/primitives/input";
import { Label } from "../../shared/ui/primitives/label";
import { Spinner } from "../../shared/ui/primitives/spinner";

type Phase = "idle" | "loading" | "ready" | "deploying" | "failed";

export interface ResourceManifestEditorHandle {
  open: () => void;
}

export const ResourceManifestEditor = forwardRef<ResourceManifestEditorHandle, {
  detail: ResourceDetail;
  disabledReason?: string | null;
  port: ResourceManifestPort;
  onInvalidate?: () => void;
  onUnauthorized?: () => void;
}>(function ResourceManifestEditor({
  detail,
  disabledReason = null,
  port,
  onInvalidate,
  onUnauthorized,
}, ref) {
  const { t } = useI18n();
  const operationStore = useOptionalOperationStatusStore();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<ResourceManifestSource | null>(null);
  const [applicationId, setApplicationId] = useState("");
  const [yaml, setYaml] = useState("");
  const [preview, setPreview] = useState<ResourceManifestPreview | null>(null);
  const [reason, setReason] = useState("");
  const [deployment, setDeployment] = useState<ResourceManifestDeployment | null>(null);
  const [failure, setFailure] = useState<"stale" | "generic" | null>(null);
  const controller = useRef<AbortController | null>(null);
  const operation = useOptionalOperationStatus(deployment?.commandId ?? "");

  useEffect(() => () => controller.current?.abort(), []);

  const load = async (selectedApplicationId?: string | null) => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setPhase("loading");
    setFailure(null);
    setPreview(null);
    setDeployment(null);
    try {
      const next = await port.loadSource(
        detail.resource.inventoryKey,
        selectedApplicationId,
        nextController.signal,
      );
      if (nextController.signal.aborted) return;
      setSource(next);
      const selected = next.selected?.applicationId ?? selectedApplicationId ?? "";
      setApplicationId(selected);
      setYaml(next.content ?? "");
      setPhase("ready");
    } catch (error) {
      if (nextController.signal.aborted) return;
      handleFailure(error);
    }
  };

  const saveAndDeploy = async () => {
    const input = editInput(source, applicationId, yaml);
    if (!input || (requiresReason(source) && reason.trim().length < 3)) return;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setPhase("deploying");
    setFailure(null);
    try {
      const result = await port.saveAndDeploy(detail.resource.inventoryKey, {
        ...input,
        reason: reason.trim(),
      }, nextController.signal);
      if (nextController.signal.aborted) return;
      setPreview(result.preview);
      setDeployment(result);
      operationStore?.start(result.operationId);
      setPhase("ready");
    } catch (error) {
      if (nextController.signal.aborted) return;
      handleFailure(error);
    }
  };

  function handleFailure(error: unknown) {
    if (error instanceof ResourceManifestPortFailure && error.code === "unauthorized") {
      onUnauthorized?.();
    }
    setFailure(
      error instanceof ResourceManifestPortFailure && error.code === "stale"
        ? "stale"
        : "generic",
    );
    setPhase("failed");
  }

  const openEditor = () => {
    if (disabledReason !== null) return;
    setOpen(true);
    setReason("");
    void load();
  };
  useImperativeHandle(ref, () => ({ open: openEditor }));

  const busy = phase === "loading" || phase === "deploying";
  const available = source?.status === "available" && source.content !== null;
  const reasonRequired = requiresReason(source);
  const resetDeployment = () => {
    setDeployment(null);
    setPreview(null);
    setFailure(null);
    setPhase("ready");
  };
  return (
    <>
      <Button
        disabled={disabledReason !== null}
        onClick={openEditor}
        size="sm"
        title={disabledReason ?? undefined}
        type="button"
        variant="outline"
      >
        <FilePenLine aria-hidden="true" />
        {t("resources.manifest.open")}
      </Button>
      <Sheet
        onOpenChange={(next) => {
          if (!next && !busy) {
            controller.current?.abort();
            setOpen(false);
          }
        }}
        open={open}
      >
        <SheetContent className="w-[min(96vw,80rem)] max-w-none sm:max-w-none" showCloseButton={!busy} side="right">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{t("resources.manifest.title", { name: detail.identity.name })}</SheetTitle>
            <SheetDescription>{t("resources.manifest.description")}</SheetDescription>
          </SheetHeader>

          <div
            className="min-h-0 overflow-y-auto pr-1 [scrollbar-color:transparent_transparent]"
            style={{ scrollbarGutter: "stable" }}
          >
            {phase === "loading" ? (
              <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
                <Spinner className="size-4" decorative />
                {t("resources.manifest.loading")}
              </p>
            ) : source?.status === "ambiguous" ? (
              <section className="grid gap-3 py-4">
                <Label htmlFor="resource-manifest-application">{t("resources.manifest.application")}</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  id="resource-manifest-application"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setApplicationId(value);
                    if (value) void load(value);
                  }}
                  value={applicationId}
                >
                  <option value="">{t("resources.manifest.chooseApplication")}</option>
                  {source.choices.map((choice) => (
                    <option key={choice.applicationId} value={choice.applicationId}>
                      {choice.applicationName} · {choice.repositoryRef}/{choice.manifestPath}
                    </option>
                  ))}
                </select>
              </section>
            ) : source && !available ? (
              <Alert className="my-4" variant="destructive">
                <AlertTitle>{t("resources.manifest.unavailable")}</AlertTitle>
                <AlertDescription>{t("resources.manifest.unavailableDescription")}</AlertDescription>
              </Alert>
            ) : available && source ? (
              <div className="grid min-h-0 gap-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {source.selected ? (
                    <>
                      <Badge variant="outline">{t("resources.manifest.gitSource")}</Badge>
                      <Badge variant="outline">{source.selected.repositoryRef}</Badge>
                      <Badge variant="outline">{source.selected.branch}</Badge>
                      <span className="min-w-0 break-all">{source.selected.manifestPath}</span>
                    </>
                  ) : (
                    <Badge variant="outline">{t("resources.manifest.liveSource")}</Badge>
                  )}
                  <span className="ml-auto font-mono">{source.baseSha?.slice(0, 12)}</span>
                </div>
                <div className="grid min-h-[28rem] gap-4 lg:grid-cols-2">
                  <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
                    <Label htmlFor="resource-manifest-yaml">{t("resources.manifest.yaml")}</Label>
                    <textarea
                      aria-label={t("resources.manifest.yaml")}
                      autoCapitalize="off"
                      autoCorrect="off"
                      className="min-h-[24rem] w-full resize-y rounded-lg border border-input bg-code p-4 font-mono text-xs leading-5 text-code-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      disabled={busy || deployment !== null}
                      id="resource-manifest-yaml"
                      onChange={(event) => {
                        setYaml(event.currentTarget.value);
                        setPreview(null);
                        setDeployment(null);
                      }}
                      spellCheck={false}
                      value={yaml}
                    />
                  </section>
                  <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{t("resources.manifest.diff")}</span>
                      {preview ? (
                        <Badge variant={preview.valid ? "outline" : "destructive"}>
                          {preview.valid ? t("resources.manifest.valid") : t("resources.manifest.invalid")}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="min-h-[24rem] overflow-auto rounded-lg border bg-muted/25 p-4">
                      {preview?.diff ? (
                        <UnifiedDiff aria-label={t("resources.manifest.diff")} diff={preview.diff} wrap />
                      ) : (
                        <p className="text-sm text-muted-foreground">{t("resources.manifest.diffEmpty")}</p>
                      )}
                    </div>
                  </section>
                </div>
                {preview?.errors.map((error) => (
                  <Alert key={error} variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
                ))}
                {preview?.impact.length ? (
                  <section aria-label={t("resources.manifest.impact")} className="grid gap-2">
                    <span className="text-sm font-medium">{t("resources.manifest.impact")}</span>
                    <div className="flex flex-wrap gap-2">
                      {preview.impact.map((item) => (
                        <Badge key={`${item.apiVersion}:${item.kind}:${item.namespace ?? ""}:${item.name}`} variant={item.selected ? "default" : "outline"}>
                          <span>{item.kind}/{item.name}</span>
                          {item.namespace ? <span>· {item.namespace}</span> : null}
                        </Badge>
                      ))}
                    </div>
                  </section>
                ) : null}
                {preview?.valid && preview.applyAvailability === "unavailable" ? (
                  <Alert>
                    <AlertTitle>{t("resources.manifest.applyUnavailable")}</AlertTitle>
                    <AlertDescription>
                      {preview.applyReasonCodes.map((code) => applyReason(code, t)).join(", ")}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {failure ? (
                  <Alert variant="destructive">
                    <AlertTitle>{failure === "stale" ? t("resources.manifest.stale") : t("resources.manifest.failed")}</AlertTitle>
                    <AlertDescription>
                      {failure === "stale" ? t("resources.manifest.staleDescription") : t("resources.manifest.failedDescription")}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {deployment ? (
                  <ManifestDeploymentProgress
                    deployment={deployment}
                    key={deployment.operationId}
                    onEditAgain={resetDeployment}
                    onRefresh={onInvalidate}
                    operation={operation}
                  />
                ) : null}
                {!deployment ? (
                  <div className="grid gap-2">
                    <Label htmlFor="resource-manifest-reason">
                      {t(reasonRequired
                        ? "resources.manifest.reason.required"
                        : "resources.manifest.reason.optional")}
                    </Label>
                    <Input
                      disabled={busy}
                      id="resource-manifest-reason"
                      maxLength={500}
                      onChange={(event) => setReason(event.currentTarget.value)}
                      placeholder={t("resources.manifest.reasonPlaceholder")}
                      required={reasonRequired}
                      value={reason}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(reasonRequired
                        ? "resources.manifest.reason.productionHelp"
                        : "resources.manifest.reason.optionalHelp")}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : phase === "failed" ? (
              <Alert className="my-4" variant="destructive">
                <AlertTitle>{t("resources.manifest.failed")}</AlertTitle>
                <AlertDescription>{t("resources.manifest.failedDescription")}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <SheetFooter className="border-t">
            {failure === "stale" ? (
              <Button onClick={() => void load(applicationId || null)} type="button" variant="outline">
                <RefreshCw aria-hidden="true" />
                {t("resources.manifest.reload")}
              </Button>
            ) : null}
            {available && !deployment ? (
              <Button
                aria-busy={phase === "deploying"}
                disabled={busy || (reasonRequired && reason.trim().length < 3)}
                onClick={() => void saveAndDeploy()}
                type="button"
              >
                {phase === "deploying" ? (
                  <Spinner className="size-4" decorative />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )}
                {t("resources.manifest.saveAndDeploy")}
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
});

function editInput(source: ResourceManifestSource | null, applicationId: string, yaml: string) {
  if (!source?.baseSha || !source.sourceSha256 || !yaml) return null;
  return {
    applicationId: source.selected?.applicationId ?? (applicationId || null),
    baseSha: source.baseSha,
    sourceSha256: source.sourceSha256,
    editedYaml: yaml,
  };
}

function requiresReason(source: ResourceManifestSource | null): boolean {
  return source?.selected?.environment.trim().toLowerCase() === "production";
}

function ManifestDeploymentProgress({
  deployment,
  onEditAgain,
  onRefresh,
  operation,
}: {
  deployment: ResourceManifestDeployment;
  onEditAgain: () => void;
  onRefresh?: () => void;
  operation: OperationStatusSnapshot | null;
}) {
  const { t } = useI18n();
  const stages = observedStages(deployment, operation);
  const currentStage = observedCurrentStage(deployment, operation);
  const pending = stages.some((stage) => stage.status === "accepted" || stage.status === "pending");
  const failed = stages.some((stage) => stage.status === "failed");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!pending) return undefined;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [deployment.operationId, pending]);
  return (
    <section aria-label={t("resources.manifest.progress")} className="grid gap-3 rounded-xl border p-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(deployment.pathway === "git" ? "resources.manifest.path.git" : "resources.manifest.path.agent")}</Badge>
          <code className="break-all text-xs text-muted-foreground">{deployment.operationId}</code>
        </div>
        <div className="flex items-center gap-2">
          {pending ? <Spinner className="size-4" decorative /> : null}
          <StatusMark
            label={stageLabel(currentStage, t)}
            tone={failed ? "critical" : pending ? "warning" : "healthy"}
          />
          {pending ? (
            <span className="tabular-nums text-xs text-muted-foreground">
              {t("resources.manifest.elapsed", { seconds: elapsedSeconds })}
            </span>
          ) : null}
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {stages.map((stage) => (
          <li className="grid min-w-0 gap-2 rounded-lg border bg-background/65 p-3" key={stage.stage}>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="text-sm font-medium">{stageLabel(stage.stage, t)}</span>
              <StatusMark label={stageStatusLabel(stage.status, t)} tone={stageTone(stage.status)} />
            </div>
            {Object.keys(stage.evidence).length ? (
              <dl className="grid gap-1 text-xs text-muted-foreground">
                {Object.entries(stage.evidence).map(([key, value]) => (
                  <div className="grid min-w-0 grid-cols-[minmax(5rem,auto)_minmax(0,1fr)] gap-2" key={key}>
                    <dt>{key}</dt>
                    <dd className="break-all font-mono text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {stage.reasonCode ? <code className="break-all text-xs text-muted-foreground">{stage.reasonCode}</code> : null}
          </li>
        ))}
      </ol>
      {deployment.pendingReasonCodes.length ? (
        <p className="break-words text-xs text-muted-foreground">
          {deployment.pendingReasonCodes.join(" · ")}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {failed ? (
          <Button onClick={onEditAgain} size="sm" type="button" variant="outline">
            <RotateCcw aria-hidden="true" />
            {t("resources.manifest.retry")}
          </Button>
        ) : (
          <Button onClick={onEditAgain} size="sm" type="button" variant="outline">
            <FilePenLine aria-hidden="true" />
            {t("resources.manifest.editAgain")}
          </Button>
        )}
        {onRefresh ? (
          <Button onClick={onRefresh} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" />
            {t("resources.manifest.refreshDetail")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function observedStages(
  deployment: ResourceManifestDeployment,
  operation: OperationStatusSnapshot | null,
): ResourceManifestDeployment["stages"] {
  if (!deployment.commandId || !operation || operation.commandId !== deployment.commandId) {
    return deployment.stages;
  }
  if (deployment.pathway === "git") {
    const eventStage = normalizedGitDeliveryStage(operation.event?.payload.stage);
    const eventStatus = operation.event?.payload.status;
    if (!eventStage) return deployment.stages;
    const currentIndex = GIT_DELIVERY_STAGES.indexOf(eventStage);
    return deployment.stages.map((stage) => {
      const stageIndex = GIT_DELIVERY_STAGES.indexOf(stage.stage);
      if (stageIndex < currentIndex && stage.status !== "unavailable") {
        return { ...stage, status: "completed" };
      }
      if (stage.stage !== eventStage) return stage;
      const evidence = operation.event?.payload.evidence;
      const observedStatus = gitDeliveryStageStatus(operation.status, eventStatus);
      return {
        ...stage,
        status: stage.status === "completed" && observedStatus === "accepted"
          ? "completed"
          : observedStatus,
        evidence: { ...stage.evidence, ...stringEvidence(evidence) },
        reasonCode: operation.failure,
      };
    });
  }
  const completed = operation.status === "completed";
  const failed = operation.status === "failed"
    || operation.status === "cancelled"
    || operation.status === "forbidden"
    || operation.status === "invalid"
    || operation.status === "unavailable";
  if (!completed && !failed) return deployment.stages;
  return deployment.stages.map((stage) => {
    if (stage.stage === "rollout") {
      return {
        ...stage,
        status: completed ? "completed" : "failed",
        reasonCode: failed ? operation.failure ?? operation.status : stage.reasonCode,
      };
    }
    if (stage.stage === "done") {
      return {
        ...stage,
        status: completed ? "completed" : "failed",
        reasonCode: failed ? operation.failure ?? operation.status : stage.reasonCode,
      };
    }
    return stage;
  });
}

function observedCurrentStage(
  deployment: ResourceManifestDeployment,
  operation: OperationStatusSnapshot | null,
): ResourceManifestDeployment["currentStage"] {
  const eventStage = normalizedGitDeliveryStage(operation?.event?.payload.stage);
  if (deployment.pathway === "git" && eventStage && eventStage !== "validation") {
    return eventStage;
  }
  if (deployment.commandId && operation?.commandId === deployment.commandId
    && operation.status === "completed") {
    return "done";
  }
  return deployment.currentStage;
}

const GIT_DELIVERY_STAGES = [
  "validation",
  "commit",
  "pull_request",
  "merge",
  "sync",
  "rollout",
  "done",
] as const;

function normalizedGitDeliveryStage(
  value: unknown,
): ResourceManifestDeployment["stages"][number]["stage"] | null {
  const stage = value === "pr" ? "pull_request" : value;
  return typeof stage === "string" && GIT_DELIVERY_STAGES.some((item) => item === stage)
    ? stage as ResourceManifestDeployment["stages"][number]["stage"]
    : null;
}

function gitDeliveryStageStatus(
  operationStatus: OperationStatusSnapshot["status"],
  eventStatus: unknown,
): ResourceManifestDeployment["stages"][number]["status"] {
  if (operationStatus === "failed" || eventStatus === "failed") return "failed";
  if (operationStatus === "completed" || eventStatus === "succeeded") return "completed";
  if (eventStatus === "review_required") return "pending";
  return "accepted";
}

function stringEvidence(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    typeof item === "string" ? item : JSON.stringify(item),
  ]));
}

function stageLabel(
  stage: ResourceManifestDeployment["stages"][number]["stage"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  return t(`resources.manifest.stage.${stage}` as Parameters<typeof t>[0]);
}

function stageStatusLabel(
  status: ResourceManifestDeployment["stages"][number]["status"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  return t(`resources.manifest.stageStatus.${status}` as Parameters<typeof t>[0]);
}

function stageTone(status: ResourceManifestDeployment["stages"][number]["status"]): StatusTone {
  if (status === "completed") return "healthy";
  if (status === "accepted" || status === "pending") return "warning";
  if (status === "failed") return "critical";
  return "unknown";
}

function applyReason(
  code: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const key = {
    agent_unavailable: "resources.manifest.applyReason.agentUnavailable",
    resource_uid_unavailable: "resources.manifest.applyReason.uidUnavailable",
    namespace_unresolved: "resources.manifest.applyReason.namespaceUnresolved",
    namespace_not_allowed: "resources.manifest.applyReason.namespaceDenied",
  }[code] as Parameters<typeof t>[0] | undefined;
  return key ? t(key) : t("resources.manifest.applyReason.unknown", { code });
}
