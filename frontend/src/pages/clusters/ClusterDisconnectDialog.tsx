import {
  Check,
  CircleCheck,
  Clipboard,
  LoaderCircle,
  ShieldCheck,
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

type DisconnectPhase =
  | "confirm"
  | "submitting"
  | "uninstalling"
  | "cleanup-required"
  | "residual-cleanup"
  | "succeeded"
  | "failed";

const COMMAND_POLL_MS = 1_000;

export function ClusterDisconnectDialog({
  cluster,
  onDisconnected,
  onOpenChange,
  open,
  port,
}: {
  cluster: HomeClusterChoice | null;
  onDisconnected: (clusterId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  port: ClusterDisconnectPort;
}) {
  const { reportUnauthorized } = useAuthSessionGate();
  const { t } = useI18n();
  const abort = useRef<AbortController | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [phase, setPhase] = useState<DisconnectPhase>("confirm");
  const [receipt, setReceipt] = useState<ClusterDisconnectReceipt | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => () => abort.current?.abort(), []);

  if (cluster === null) return null;
  const confirmed = confirmation === cluster.name;
  const pending = phase === "submitting" || phase === "uninstalling";
  const terminal = phase === "succeeded" || phase === "residual-cleanup";

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && pending) return;
    if (!nextOpen) {
      abort.current?.abort();
      abort.current = null;
      setConfirmation("");
      setPhase("confirm");
      setReceipt(null);
      setCopied(false);
    }
    onOpenChange(nextOpen);
  };

  const finishDisconnect = (nextPhase: DisconnectPhase) => {
    setPhase(nextPhase);
    onDisconnected(cluster.id);
  };

  const followCommand = async (
    commandId: string,
    uninstallCommand: string | null,
    controller: AbortController,
  ): Promise<void> => {
    setPhase("uninstalling");
    while (!controller.signal.aborted) {
      const progress = await port.loadDisconnect(commandId, controller.signal);
      if (progress.status === "completed" && progress.cleanupCompleted) {
        finishDisconnect("residual-cleanup");
        return;
      }
      if (progress.status === "completed" || progress.status === "failed") {
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

  const confirmCleanup = async () => {
    if (pending) return;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setPhase("submitting");
    try {
      const nextReceipt = await port.confirmManualCleanup(cluster.id, controller.signal);
      if (controller.signal.aborted) return;
      setReceipt(nextReceipt);
      finishDisconnect("succeeded");
    } catch (error) {
      if (isAbortError(error)) return;
      handleFailure(error, reportUnauthorized);
      setPhase("cleanup-required");
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  };

  const copyCommand = async () => {
    if (!receipt?.uninstallCommand) return;
    await navigator.clipboard?.writeText(receipt.uninstallCommand);
    setCopied(true);
  };

  return (
    <Dialog
      onOpenChange={changeOpen}
      open={open}
    >
      <DialogContent
        className="overflow-hidden sm:max-w-xl"
        closeLabel={t("common.action.close")}
        showCloseButton={!pending && !terminal}
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

          {phase === "cleanup-required" || phase === "residual-cleanup" ? (
            <CleanupCommand
              command={receipt?.uninstallCommand ?? null}
              copied={copied}
              copyLabel={t("clusters.disconnect.manual.copy")}
              description={t("clusters.disconnect.manual.description")}
              onCopy={() => void copyCommand()}
              residualResources={receipt?.residualResources ?? []}
              resourcesLabel={(count, resources) => t("clusters.disconnect.manual.resources", {
                count,
                resources,
              })}
              commandLabel={t("clusters.disconnect.manual.command")}
              title={phase === "residual-cleanup"
                ? t("clusters.disconnect.residual.title")
                : t("clusters.disconnect.manual.title")}
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
              <Button onClick={() => void confirmCleanup()} type="button">
                <ShieldCheck aria-hidden="true" />
                {t("clusters.disconnect.manual.confirm")}
              </Button>
            ) : pending ? (
              <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                {phase === "submitting"
                  ? t("clusters.disconnect.submitting")
                  : t("clusters.disconnect.uninstalling")}
              </p>
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
    { label: t("clusters.disconnect.progress.request"), complete: true },
    { label: t("clusters.disconnect.progress.agent"), complete: phase === "uninstalling" },
    { label: t("clusters.disconnect.progress.registration"), complete: false },
  ];
  return (
    <ol className="grid gap-2 rounded-xl border bg-muted/30 p-3" aria-label="클러스터 연결 해제 진행">
      {steps.map((step, index) => (
        <li className="flex min-w-0 items-center gap-2 text-sm" key={step.label}>
          {step.complete ? (
            <Check aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
          ) : index === 1 || phase === "uninstalling" ? (
            <LoaderCircle aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
          ) : (
            <span aria-hidden="true" className="size-4 shrink-0 rounded-full border" />
          )}
          <span className="truncate">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function CleanupCommand({
  command,
  commandLabel,
  copied,
  copyLabel,
  description,
  onCopy,
  residualResources,
  resourcesLabel,
  title,
}: {
  command: string | null;
  commandLabel: string;
  copied: boolean;
  copyLabel: string;
  description: string;
  onCopy: () => void;
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
      {command ? (
        <div className="grid min-w-0 gap-2">
          <p className="text-xs font-medium">{commandLabel}</p>
          <div className="flex min-w-0 items-start gap-2 rounded-lg bg-zinc-950 p-3 text-zinc-100">
            <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-xs leading-5">{command}</pre>
            <Button
              aria-label={copyLabel}
              className="shrink-0 text-zinc-100 hover:bg-white/10 hover:text-white"
              onClick={onCopy}
              size="icon"
              type="button"
              variant="ghost"
            >
              {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
            </Button>
          </div>
        </div>
      ) : null}
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
  if (phase === "residual-cleanup") return t("clusters.disconnect.agentStopped.title");
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
