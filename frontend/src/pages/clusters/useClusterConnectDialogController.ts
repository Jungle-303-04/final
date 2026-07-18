import { useEffect, useRef, useState } from "react";
import {
  ClustersPortFailure,
  type ClusterConnectProvider,
  type ClusterConnectReceipt,
  type ClusterConnectStage,
  type ClustersPort,
} from "../../features/clusters/clustersContract";

export type ClusterConnectWizardStep = 1 | 2 | 3;
export type ConnectPhase =
  | "idle"
  | "submitting"
  | "waiting"
  | "reissuing"
  | "finishing"
  | "connected"
  | "expired"
  | "failed";

export function useClusterConnectDialogController({
  existingNames,
  onConnected,
  onOpenChange,
  open,
  port,
  reportUnauthorized,
}: {
  existingNames: readonly string[];
  onConnected: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  port: ClustersPort;
  reportUnauthorized: () => void;
}) {
  const [step, setStep] = useState<ClusterConnectWizardStep>(1);
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
          if (phase === "finishing") {
            setPhase("connected");
            setStep(3);
            onConnected();
            return;
          }
          setPhase("finishing");
        } else if (connection.status === "expired") {
          setPhase("expired");
        } else if (connection.stage === "error") {
          setPhase("failed");
        } else if (phase === "finishing") {
          setPhase("waiting");
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
          timeout = window.setTimeout(() => void poll(), refreshAfterSeconds * 1_000);
        }
      }
    };
    if (phase === "waiting") {
      void poll();
    } else {
      const refreshAfterSeconds = nextPollAfterSeconds.current;
      if (refreshAfterSeconds !== null) {
        timeout = window.setTimeout(() => void poll(), refreshAfterSeconds * 1_000);
      }
    }
    return () => {
      active = false;
      controller.abort();
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [onConnected, open, phase, port, receipt, reportUnauthorized, step]);

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
  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && (phase === "submitting" || phase === "reissuing")) return;
    if (!nextOpen) {
      connectAbort.current?.abort();
      connectAbort.current = null;
      if (step === 3) reset();
    }
    onOpenChange(nextOpen);
  };
  const changeName = (nextName: string) => {
    setName(nextName);
    setServerNameConflict(false);
  };
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
    setCopyState("copied");
    try {
      await navigator.clipboard.writeText(receipt.installCommand);
    } catch {
      setCopyState("failed");
    }
  };

  return {
    changeName,
    changeOpen,
    connectionStage,
    copyCommand,
    copyState,
    elapsedSeconds,
    name,
    nameConflict,
    phase,
    provider,
    receipt,
    register,
    reissue,
    setProvider,
    step,
  };
}

function normalizeDisplayName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
