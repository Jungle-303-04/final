import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import {
  ClustersPortFailure,
  type ClusterConnectProvider,
  type ClusterConnectReceipt,
  type ClusterConnectStage,
  type ClustersPort,
} from "../../features/clusters/clustersContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n } from "../../shared/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import { ConnectionCommandStep } from "./ClusterConnectDialogParts";
import {
  ClusterConnectedStep,
  ClusterRegistrationStep,
} from "./ClusterConnectDialogPanels";
import {
  isAbortError, normalizeDisplayName, type ConnectPhase, type WizardStep,
} from "./ClusterConnectDialogTypes";
import { clusterResourcesHref } from "./clusterNavigation";

const STEP_MOTION = "motion-wizard-stage";

export function ClusterConnectDialog({
  existingNames,
  onConnected,
  onRegistered,
  onOpenChange,
  open,
  port,
}: {
  existingNames: readonly string[];
  onConnected: () => void;
  onRegistered?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  port: ClustersPort;
}) {
  const { reportUnauthorized } = useAuthSessionGate();
  const filter = useUnifiedFilter();
  const { formatDate, t } = useI18n();
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ClusterConnectProvider>("aws");
  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const [receipt, setReceipt] = useState<ClusterConnectReceipt | null>(null);
  const [connectionStage, setConnectionStage] = useState<ClusterConnectStage>("awaiting_install");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [serverNameConflict, setServerNameConflict] = useState(false);
  const connectAbort = useRef<AbortController | null>(null);
  const waitingStartedAt = useRef<number | null>(null);
  const nextPollAfterSeconds = useRef<number | null>(null);
  const normalizedName = normalizeDisplayName(name);
  const duplicateName = normalizedName.length > 0 && existingNames.some(
    (existingName) => normalizeDisplayName(existingName) === normalizedName,
  );
  const nameConflict = duplicateName || serverNameConflict;

  useEffect(() => {
    if (!open || step !== 2 || !receipt || (phase !== "waiting" && phase !== "finishing")) return;
    const controller = new AbortController();
    let active = true;
    let timeout: number | undefined;
    const poll = async () => {
      nextPollAfterSeconds.current = null;
      try {
        const connection = await port.loadConnection(receipt.clusterId, controller.signal);
        if (!active) return;
        nextPollAfterSeconds.current = connection.refreshAfterSeconds;
        setConnectionStage(connection.stage);
        if (connection.status === "connected") {
          setPhase("connected");
          setStep(3);
          onConnected();
          onOpenChange(false);
          return;
        } else if (connection.status === "expired") {
          setPhase("expired");
        } else if (connection.stage === "error") {
          setPhase("failed");
        }
      } catch (error) {
        if (!active || isAbortError(error)) return;
        nextPollAfterSeconds.current = null;
        if (error instanceof ClustersPortFailure && error.code === "unauthorized") {
          reportUnauthorized();
          return;
        }
        setPhase("failed");
      } finally {
        const refreshAfterSeconds = nextPollAfterSeconds.current;
        if (active && phase === "waiting" && refreshAfterSeconds !== null) {
          timeout = window.setTimeout(
            () => void poll(),
            refreshAfterSeconds * 1_000,
          );
        }
      }
    };
    if (phase === "waiting") {
      void poll();
    } else {
      const refreshAfterSeconds = nextPollAfterSeconds.current;
      if (refreshAfterSeconds !== null) {
        timeout = window.setTimeout(
          () => void poll(),
          refreshAfterSeconds * 1_000,
        );
      }
    }
    return () => {
      active = false;
      controller.abort();
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [onConnected, onOpenChange, open, phase, port, receipt, reportUnauthorized, step]);

  useEffect(() => {
    if (!open || step !== 2 || phase !== "waiting") return;
    waitingStartedAt.current ??= Date.now();
    const updateElapsed = () => {
      const startedAt = waitingStartedAt.current;
      if (startedAt === null) return;
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    };
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(interval);
  }, [open, phase, step]);

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && (phase === "submitting" || phase === "reissuing")) return;
    if (!nextOpen) {
      connectAbort.current?.abort();
      connectAbort.current = null;
      if (step === 3) reset();
    }
    onOpenChange(nextOpen);
  };
  const reset = () => {
    setStep(1);
    setName("");
    setProvider("aws");
    setPhase("idle");
    setReceipt(null);
    setConnectionStage("awaiting_install");
    setElapsedSeconds(0);
    waitingStartedAt.current = null;
    nextPollAfterSeconds.current = null;
    setCopyState("idle");
    setServerNameConflict(false);
  };
  useEffect(() => {
    if (!open && phase === "connected") reset();
  }, [open, phase]);
  const register = async () => {
    if (!name.trim() || nameConflict || phase === "submitting") return;
    const controller = new AbortController();
    connectAbort.current = controller;
    setElapsedSeconds(0);
    setServerNameConflict(false);
    setPhase("submitting");
    try {
      const nextReceipt = await port.connect({ name: name.trim(), provider }, controller.signal);
      setReceipt(nextReceipt);
      setConnectionStage("awaiting_install");
      waitingStartedAt.current = Date.now();
      nextPollAfterSeconds.current = null;
      setPhase("waiting");
      setStep(2);
      onRegistered?.();
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof ClustersPortFailure && error.code === "unauthorized") {
        reportUnauthorized();
        return;
      }
      if (error instanceof ClustersPortFailure && error.code === "conflict") {
        setServerNameConflict(true);
        setPhase("idle");
        setStep(1);
        return;
      }
      setPhase("failed");
      setStep(2);
    } finally {
      if (connectAbort.current === controller) connectAbort.current = null;
    }
  };
  const reissue = async () => {
    if (!receipt || phase === "reissuing") return;
    const controller = new AbortController();
    connectAbort.current?.abort();
    connectAbort.current = controller;
    setPhase("reissuing");
    setCopyState("idle");
    try {
      const nextReceipt = await port.reissue(receipt.clusterId, controller.signal);
      if (controller.signal.aborted) return;
      setReceipt(nextReceipt);
      setConnectionStage("awaiting_install");
      setElapsedSeconds(0);
      waitingStartedAt.current = Date.now();
      nextPollAfterSeconds.current = null;
      setPhase("waiting");
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof ClustersPortFailure && error.code === "unauthorized") {
        reportUnauthorized();
        return;
      }
      setPhase("failed");
    } finally {
      if (connectAbort.current === controller) connectAbort.current = null;
    }
  };
  const copyCommand = async () => {
    if (!receipt) return;
    // Clipboard writes do not need a loading state. Acknowledge the click immediately,
    // then surface the uncommon permission failure if the browser rejects the write.
    setCopyState("copied");
    try {
      await navigator.clipboard.writeText(receipt.installCommand);
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogContent
        className="sm:max-w-2xl"
        closeLabel={t("common.action.close")}
        showCloseButton={phase !== "submitting" && phase !== "reissuing"}
      >
        <DialogHeader>
          <p className="text-xs font-medium text-muted-foreground">
            {t("clusters.connect.step", { current: step, total: 3 })}
          </p>
          <DialogTitle>{t("clusters.connect.title")}</DialogTitle>
          <DialogDescription>{t("clusters.connect.description")}</DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <ClusterRegistrationStep
            name={name}
            nameConflict={nameConflict}
            onNameChange={(nextName) => {
              setName(nextName);
              setServerNameConflict(false);
            }}
            onProviderChange={setProvider}
            onRegister={() => void register()}
            phase={phase}
            provider={provider}
            t={t}
          />
        ) : null}

        {step === 2 ? (
          <div className={STEP_MOTION}>
            <ConnectionCommandStep
              copyState={copyState}
              connectionStage={connectionStage}
              elapsedSeconds={elapsedSeconds}
              expiresAt={receipt?.expiresAt ?? null}
              formatDate={formatDate}
              installCommand={receipt?.installCommand ?? null}
              onCopy={() => void copyCommand()}
              onReissue={() => void reissue()}
              phase={phase}
              t={t}
            />
          </div>
        ) : null}

        {step === 3 && receipt ? (
          <ClusterConnectedStep
            href={clusterResourcesHref(filter.state, receipt.clusterId)}
            t={t}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
