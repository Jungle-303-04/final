import { Check, LoaderCircle } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Link } from "react-router-dom";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import {
  ClustersPortFailure,
  type ClusterConnectProvider,
  type ClusterConnectReceipt,
  type ClusterConnectStage,
  type ClustersPort,
} from "../../features/clusters/clustersContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { ProviderLogo, type ProviderLogoKind } from "../../shared/brand/ProviderLogo";
import { Button } from "../../shared/ui/primitives/button";
import { cn } from "@/shared/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import { ConnectionCommandStep } from "./ClusterConnectDialogParts";
import { clusterResourcesHref } from "./clusterNavigation";

const POLL_INTERVAL_MS = 2_000;
const providers: readonly {
  id: ClusterConnectProvider;
  logo: ProviderLogoKind | ComponentType<{ className?: string }>;
  labelKey: MessageKey;
}[] = [
  { id: "aws", logo: "eks", labelKey: "clusters.connect.provider.aws" },
  { id: "gcp", logo: "gke", labelKey: "clusters.connect.provider.gcp" },
  { id: "azure", logo: "aks", labelKey: "clusters.connect.provider.azure" },
];

type WizardStep = 1 | 2 | 3;
export type ConnectPhase = "idle" | "submitting" | "waiting" | "expired" | "failed";

// 단계가 바뀔 때마다 마운트되면서 슬라이드+페이드로 들어온다 (VP-017 모션 idiom).
const STEP_MOTION =
  "animate-in fade-in-0 slide-in-from-right-2 duration-200 ease-out motion-reduce:animate-none";

export function ClusterConnectDialog({
  onConnected,
  onOpenChange,
  open,
  port,
}: {
  onConnected: () => void;
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
  const connectAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || step !== 2 || !receipt || phase !== "waiting") return;
    const controller = new AbortController();
    let active = true;
    const poll = async () => {
      try {
        const connection = await port.loadConnection(receipt.clusterId, controller.signal);
        if (!active) return;
        setConnectionStage(connection.stage);
        if (connection.status === "connected") {
          setStep(3);
          onConnected();
        } else if (connection.status === "expired") {
          setPhase("expired");
        } else if (connection.stage === "error") {
          setPhase("failed");
        }
      } catch (error) {
        if (!active || isAbortError(error)) return;
        if (error instanceof ClustersPortFailure && error.code === "unauthorized") {
          reportUnauthorized();
          return;
        }
        setPhase("failed");
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [onConnected, open, phase, port, receipt, reportUnauthorized, step]);

  useEffect(() => {
    if (!open || step !== 2 || phase !== "waiting") return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [open, phase, step]);

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      connectAbort.current?.abort();
      reset();
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
    setCopyState("idle");
  };
  const register = async () => {
    if (!name.trim() || phase === "submitting") return;
    const controller = new AbortController();
    connectAbort.current = controller;
    setElapsedSeconds(0);
    setPhase("submitting");
    try {
      const nextReceipt = await port.connect({ name: name.trim(), provider }, controller.signal);
      setReceipt(nextReceipt);
      setConnectionStage("awaiting_install");
      setPhase("waiting");
      setStep(2);
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof ClustersPortFailure && error.code === "unauthorized") {
        reportUnauthorized();
        return;
      }
      setPhase("failed");
      setStep(2);
    } finally {
      if (connectAbort.current === controller) connectAbort.current = null;
    }
  };
  const copyCommand = async () => {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.installCommand);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogContent className="sm:max-w-2xl" closeLabel={t("common.action.close")}>
        <DialogHeader>
          <p className="text-xs font-medium text-muted-foreground">
            {t("clusters.connect.step", { current: step, total: 3 })}
          </p>
          <DialogTitle>{t("clusters.connect.title")}</DialogTitle>
          <DialogDescription>{t("clusters.connect.description")}</DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className={cn("grid gap-5", STEP_MOTION)}>
            <label className="grid gap-2 text-sm font-medium">
              {t("clusters.connect.name.label")}
              <Input
                autoFocus
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder={t("clusters.connect.name.placeholder")}
                value={name}
              />
            </label>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("clusters.connect.provider.label")}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {providers.map(({ id, logo, labelKey }) => (
                  <button
                    aria-pressed={provider === id}
                    className={cn(
                      "grid min-h-24 place-items-center gap-2 rounded-xl border bg-card p-3 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                      provider === id && "border-ring bg-muted",
                    )}
                    key={id}
                    onClick={() => setProvider(id)}
                    type="button"
                  >
                    <ConnectProviderLogo logo={logo} />
                    <span>{t(labelKey)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <DialogFooter className="mt-1">
              <Button disabled={!name.trim() || phase === "submitting"} onClick={() => void register()}>
                {phase === "submitting" ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
                {t("clusters.connect.action.register")}
              </Button>
            </DialogFooter>
          </div>
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
              phase={phase}
              t={t}
            />
          </div>
        ) : null}

        {step === 3 && receipt ? (
          <div className={cn("grid justify-items-center gap-4 py-6 text-center", STEP_MOTION)}>
            <span className="grid size-12 place-items-center rounded-full bg-status-healthy/15 text-status-healthy">
              <Check aria-hidden="true" className="size-6" />
            </span>
            <div className="grid gap-1">
              <h3 className="text-lg font-semibold">{t("clusters.connect.connected.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("clusters.connect.connected.description")}</p>
            </div>
            <Button render={<Link to={clusterResourcesHref(filter.state, receipt.clusterId)} />}>
              {t("clusters.connect.action.view")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ConnectProviderLogo({
  logo,
}: {
  logo: ProviderLogoKind | ComponentType<{ className?: string }>;
}) {
  if (typeof logo === "string") {
    return <ProviderLogo className="size-6" provider={logo} />;
  }
  const ProviderIcon = logo;
  return <ProviderIcon className="size-6" />;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
