import {
  Check,
  CircleCheck,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import {
  ClustersPortFailure,
  type ClusterDisconnectPort,
  type ClusterDisconnectReceipt,
} from "../../features/clusters/clustersContract";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import type { TranslationFunction } from "../../shared/i18n/types";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
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
import { Spinner } from "../../shared/ui/primitives/spinner";

export type DisconnectPhase =
  | "confirm"
  | "submitting"
  | "uninstalling"
  | "cleanup-required"
  | "succeeded"
  | "failed";

const COMMAND_POLL_MS = 1_000;
const COMMAND_ACK_TIMEOUT_MS = 8_000;

export function ClusterDisconnectDialog({
  cluster,
  onDisconnected,
  onOpenChange,
  onPhaseChange,
  open,
  port,
}: {
  cluster: HomeClusterChoice | null;
  onDisconnected: (clusterId: string) => void;
  onOpenChange: (open: boolean) => void;
  onPhaseChange?: (clusterId: string, phase: DisconnectPhase) => void;
  open: boolean;
  port: ClusterDisconnectPort;
}) {
  const { reportUnauthorized } = useAuthSessionGate();
  const { t } = useI18n();
  const abort = useRef<AbortController | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [phase, setPhase] = useState<DisconnectPhase>("confirm");
  const [receipt, setReceipt] = useState<ClusterDisconnectReceipt | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    if (cluster) onPhaseChange?.(cluster.id, phase);
  }, [cluster, onPhaseChange, phase]);

  if (cluster === null) return null;
  const confirmed = confirmation === cluster.name;
  const pending = phase === "submitting" || phase === "uninstalling";
  const terminal = phase === "succeeded";

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && (pending || phase === "cleanup-required")) {
      onOpenChange(false);
      return;
    }
    if (!nextOpen) {
      abort.current?.abort();
      abort.current = null;
      setConfirmation("");
      setPhase("confirm");
      setReceipt(null);
    }
    onOpenChange(nextOpen);
  };

  const finishDisconnect = (nextPhase: DisconnectPhase) => {
    setPhase(nextPhase);
    if (nextPhase === "succeeded") onDisconnected(cluster.id);
  };

  const followCommand = async (
    commandId: string,
    uninstallCommand: string | null,
    controller: AbortController,
  ): Promise<void> => {
    setPhase("uninstalling");
    const deadline = Date.now() + COMMAND_ACK_TIMEOUT_MS;
    while (!controller.signal.aborted) {
      const progress = await port.loadDisconnect(commandId, controller.signal);
      if (progress.status === "completed" && progress.cleanupCompleted) {
        const cleanupVerified = progress.residualResources.length === 0;
        setReceipt((current) => current === null ? current : {
          ...current,
          stage: cleanupVerified ? "registration_revoked" : current.stage,
          cleanupVerified,
          cleanupResources: progress.cleanupResources,
          residualResources: progress.residualResources,
        });
        if (cleanupVerified) finishDisconnect("succeeded");
        else setPhase("cleanup-required");
        return;
      }
      if (progress.status === "completed" || progress.status === "failed") {
        setPhase(uninstallCommand ? "cleanup-required" : "failed");
        return;
      }
      if (Date.now() >= deadline) {
        setPhase(uninstallCommand ? "cleanup-required" : "failed");
        return;
      }
      await wait(COMMAND_POLL_MS, controller.signal);
    }
  };

  const applyReceipt = async (
    nextReceipt: ClusterDisconnectReceipt,
    controller: AbortController,
  ) => {
    setReceipt(nextReceipt);
    if (nextReceipt.status === "disconnected") {
      finishDisconnect("succeeded");
      return;
    }
    if (nextReceipt.status === "cleanup-required" || nextReceipt.commandId === null) {
      setPhase("cleanup-required");
      return;
    }
    await followCommand(nextReceipt.commandId, nextReceipt.uninstallCommand, controller);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!confirmed || pending) return;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setPhase("submitting");
    try {
      await applyReceipt(await port.disconnect(cluster.id, controller.signal), controller);
    } catch (error) {
      if (isAbortError(error)) return;
      handleFailure(error, reportUnauthorized);
      setPhase("failed");
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  };

  return (
    <Dialog
      onOpenChange={changeOpen}
      open={open}
    >
      <DialogContent
        className="overflow-hidden sm:max-w-xl"
        closeLabel={t("common.action.close")}
        showCloseButton={!terminal}
      >
        <form className="grid min-w-0 gap-5" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{phaseTitle(phase, t)}</DialogTitle>
            <DialogDescription>
              {phase === "confirm"
                ? t("clusters.disconnect.description", { name: cluster.name })
                : t("clusters.disconnect.progress.description", { name: cluster.name })}
            </DialogDescription>
          </DialogHeader>

          {phase === "confirm" || phase === "failed" ? (
            <div className="grid gap-2">
              <Label htmlFor="cluster-disconnect-confirmation">
                {t("clusters.disconnect.confirm.label")}
              </Label>
              <Input
                autoComplete="off"
                autoFocus
                disabled={pending}
                id="cluster-disconnect-confirmation"
                onChange={(event) => setConfirmation(event.currentTarget.value)}
                spellCheck={false}
                value={confirmation}
              />
              <p className="text-xs text-muted-foreground">
                {t("clusters.disconnect.confirm.hint", { name: cluster.name })}
              </p>
            </div>
          ) : null}

          {pending ? <DisconnectProgress phase={phase} t={t} /> : null}

          {receipt ? <DisconnectEvidence phase={phase} receipt={receipt} t={t} /> : null}

          {phase === "cleanup-required" ? (
            <CleanupPending
              description={t("clusters.disconnect.manual.description")}
              residualResources={receipt?.residualResources ?? []}
              resourcesLabel={(count, resources) => t("clusters.disconnect.manual.resources", {
                count,
                resources,
              })}
              title={t("clusters.disconnect.manual.title")}
            />
          ) : null}

          {phase === "succeeded" ? (
            <Alert>
              <CircleCheck aria-hidden="true" />
              <AlertDescription>{t("clusters.disconnect.success.description")}</AlertDescription>
            </Alert>
          ) : null}

          {phase === "failed" ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>{t("clusters.disconnect.failure.title")}</AlertTitle>
              <AlertDescription>{t("clusters.disconnect.failure.description")}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            {terminal ? (
              <Button onClick={() => changeOpen(false)} type="button">
                {t("common.action.close")}
              </Button>
            ) : phase === "cleanup-required" ? (
              <Button onClick={() => changeOpen(false)} type="button" variant="outline">
                {t("clusters.disconnect.background")}
              </Button>
            ) : pending ? (
              <div className="flex w-full items-center justify-between gap-3">
                <p className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Spinner className="size-4 shrink-0" decorative />
                  <span className="truncate">{phase === "submitting"
                    ? t("clusters.disconnect.submitting")
                    : t("clusters.disconnect.uninstalling")}</span>
                </p>
                <Button onClick={() => changeOpen(false)} type="button" variant="outline">
                  {t("clusters.disconnect.background")}
                </Button>
              </div>
            ) : (
              <>
                <Button onClick={() => changeOpen(false)} type="button" variant="outline">
                  {t("common.action.cancel")}
                </Button>
                <Button disabled={!confirmed} type="submit" variant="destructive">
                  <Unplug aria-hidden="true" />
                  {t("clusters.action.disconnect")}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisconnectProgress({ phase, t }: { phase: DisconnectPhase; t: TranslationFunction }) {
  const steps = [
    {
      label: t("clusters.disconnect.progress.request"),
      state: phase === "submitting" ? "active" : "complete",
    },
    {
      label: t("clusters.disconnect.progress.agent"),
      state: phase === "uninstalling" ? "active" : "pending",
    },
    { label: t("clusters.disconnect.progress.registration"), state: "pending" },
  ];
  return (
    <ol className="grid gap-2 rounded-xl border bg-muted/30 p-3" aria-label="클러스터 연결 해제 진행">
      {steps.map((step) => (
        <li className="flex min-w-0 items-center gap-2 text-sm" key={step.label}>
          {step.state === "complete" ? (
            <Check aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
          ) : step.state === "active" ? (
            <Spinner className="size-4 shrink-0" decorative />
          ) : (
            <span aria-hidden="true" className="size-4 shrink-0 rounded-full border" />
          )}
          <span className="truncate" data-step-state={step.state}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function DisconnectEvidence({
  phase,
  receipt,
  t,
}: {
  phase: DisconnectPhase;
  receipt: ClusterDisconnectReceipt;
  t: TranslationFunction;
}) {
  const cleanupFinished = receipt.cleanupVerified || phase === "succeeded";
  const registrationRevoked = receipt.stage === "registration_revoked" || cleanupFinished;
  const noInstalledAgentResources = receipt.status === "disconnected"
    && receipt.commandId === null
    && receipt.cleanupResources.length === 0;
  const rows = [
    {
      label: t("clusters.disconnect.evidence.cleanup.label"),
      value: noInstalledAgentResources
        ? t("clusters.disconnect.evidence.cleanup.none")
        : cleanupFinished
        ? t("clusters.disconnect.evidence.cleanup.complete")
        : receipt.stage === "agent_cleanup_queued"
          ? t("clusters.disconnect.evidence.cleanup.queued")
          : t("clusters.disconnect.evidence.pending"),
      complete: cleanupFinished || noInstalledAgentResources,
    },
    {
      label: t("clusters.disconnect.evidence.credentials.label"),
      value: registrationRevoked
        ? t("clusters.disconnect.evidence.credentials.revoked")
        : t("clusters.disconnect.evidence.pending"),
      complete: registrationRevoked,
    },
    {
      label: t("clusters.disconnect.evidence.registration.label"),
      value: registrationRevoked
        ? t("clusters.disconnect.evidence.registration.revoked")
        : t("clusters.disconnect.evidence.pending"),
      complete: registrationRevoked,
    },
    {
      label: t("clusters.disconnect.evidence.residual.label"),
      value: t("clusters.disconnect.evidence.residual.count", {
        count: receipt.residualResources.length,
      }),
      complete: cleanupFinished && receipt.residualResources.length === 0,
    },
  ];

  return (
    <section
      className="grid gap-2 rounded-xl border bg-muted/20 p-3"
      aria-label={t("clusters.disconnect.evidence.aria")}
    >
      {rows.map((row) => (
        <div className="flex min-w-0 items-center gap-2 text-xs" key={row.label}>
          {row.complete ? (
            <Check aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
          ) : (
            <span aria-hidden="true" className="size-4 shrink-0 rounded-full border" />
          )}
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.label}</span>
          <span className="shrink-0 font-medium">{row.value}</span>
        </div>
      ))}
      {receipt.cleanupResources.length > 0 ? (
        <p className="break-words text-xs text-muted-foreground">
          {t("clusters.disconnect.evidence.targets", {
            count: receipt.cleanupResources.length,
            resources: receipt.cleanupResources.join(", "),
          })}
        </p>
      ) : null}
    </section>
  );
}

function CleanupPending({
  description,
  residualResources,
  resourcesLabel,
  title,
}: {
  description: string;
  residualResources: string[];
  resourcesLabel: (count: number, resources: string) => string;
  title: string;
}) {
  return (
    <section className="grid min-w-0 gap-3 rounded-xl border border-amber-500/35 bg-amber-500/5 p-4">
      <div className="flex items-start gap-2">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {residualResources.length > 0 ? (
        <p className="break-words text-xs text-muted-foreground">
          {resourcesLabel(residualResources.length, residualResources.join(", "))}
        </p>
      ) : null}
    </section>
  );
}

function phaseTitle(
  phase: DisconnectPhase,
  t: TranslationFunction,
): string {
  if (phase === "cleanup-required") return t("clusters.disconnect.manual.heading");
  if (phase === "succeeded") return t("clusters.disconnect.success.title");
  return t("clusters.disconnect.title");
}

function handleFailure(error: unknown, reportUnauthorized: () => void): void {
  if (error instanceof ClustersPortFailure && error.code === "unauthorized") reportUnauthorized();
}

function wait(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, durationMs);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
