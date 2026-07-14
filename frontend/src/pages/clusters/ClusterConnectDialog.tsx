import {
  IconBrandAws,
  IconBrandAzure,
  IconBrandGoogle,
  type Icon,
} from "@tabler/icons-react";
import { Check, LoaderCircle, ServerCog } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import { Link } from "react-router-dom";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import {
  ClustersPortFailure,
  type ClusterConnectProvider,
  type ClusterConnectReceipt,
  type ClustersPort,
} from "../../features/clusters/clustersContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { cn } from "../../shared/ui/primitives/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import { ConnectionCommandStep, ConnectionModeButton } from "./ClusterConnectDialogParts";
import { clusterResourcesHref } from "./clusterNavigation";

const POLL_INTERVAL_MS = 2_000;
const providers: readonly {
  id: ClusterConnectProvider;
  icon: ComponentType<SVGProps<SVGSVGElement>> | Icon;
  labelKey: MessageKey;
}[] = [
  { id: "aws", icon: IconBrandAws, labelKey: "clusters.connect.provider.aws" },
  { id: "gcp", icon: IconBrandGoogle, labelKey: "clusters.connect.provider.gcp" },
  { id: "azure", icon: IconBrandAzure, labelKey: "clusters.connect.provider.azure" },
  { id: "onprem", icon: ServerCog, labelKey: "clusters.connect.provider.onprem" },
];

type WizardStep = 1 | 2 | 3 | 4;
export type ConnectPhase = "idle" | "submitting" | "waiting" | "expired" | "failed";

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
  const [createMode, setCreateMode] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ClusterConnectProvider>("onprem");
  const [phase, setPhase] = useState<ConnectPhase>("idle");
  const [receipt, setReceipt] = useState<ClusterConnectReceipt | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const connectAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || step !== 3 || !receipt || phase !== "waiting") return;
    const controller = new AbortController();
    let active = true;
    const poll = async () => {
      try {
        const connection = await port.loadConnection(receipt.clusterId, controller.signal);
        if (!active) return;
        if (connection.status === "connected") {
          setStep(4);
          onConnected();
        } else if (connection.status === "expired") {
          setPhase("expired");
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

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      connectAbort.current?.abort();
      reset();
    }
    onOpenChange(nextOpen);
  };
  const reset = () => {
    setStep(1);
    setCreateMode(false);
    setName("");
    setProvider("onprem");
    setPhase("idle");
    setReceipt(null);
    setCopyState("idle");
  };
  const register = async () => {
    if (!name.trim() || phase === "submitting") return;
    const controller = new AbortController();
    connectAbort.current = controller;
    setPhase("submitting");
    try {
      const nextReceipt = await port.connect({ name: name.trim(), provider }, controller.signal);
      setReceipt(nextReceipt);
      setPhase("waiting");
      setStep(3);
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof ClustersPortFailure && error.code === "unauthorized") {
        reportUnauthorized();
        return;
      }
      setPhase("failed");
      setStep(3);
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
            {t("clusters.connect.step", { current: step, total: 4 })}
          </p>
          <DialogTitle>{t("clusters.connect.title")}</DialogTitle>
          <DialogDescription>{t("clusters.connect.description")}</DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ConnectionModeButton
              description={t("clusters.connect.existing.description")}
              onClick={() => {
                setCreateMode(false);
                setStep(2);
              }}
              title={t("clusters.connect.existing.title")}
            />
            <ConnectionModeButton
              description={t("clusters.connect.create.description")}
              onClick={() => {
                setCreateMode(true);
                setStep(2);
              }}
              title={t("clusters.connect.create.title")}
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-5">
            {createMode ? (
              <Alert><AlertDescription>{t("clusters.connect.create.note")}</AlertDescription></Alert>
            ) : null}
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
                {providers.map(({ id, icon: ProviderIcon, labelKey }) => (
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
                    <ProviderIcon aria-hidden="true" className="size-6" />
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
              <Button onClick={() => setStep(1)} variant="outline">{t("common.action.back")}</Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === 3 ? (
          <ConnectionCommandStep
            copyState={copyState}
            expiresAt={receipt?.expiresAt ?? null}
            formatDate={formatDate}
            installCommand={receipt?.installCommand ?? null}
            onCopy={() => void copyCommand()}
            phase={phase}
            t={t}
          />
        ) : null}

        {step === 4 && receipt ? (
          <div className="grid justify-items-center gap-4 py-6 text-center">
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

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
