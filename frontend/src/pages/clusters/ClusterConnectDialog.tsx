import {
  Check,
  ChevronRight,
  Server,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import type { ClustersPort } from "../../features/clusters/clustersContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n } from "../../shared/i18n";
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
import { Spinner } from "../../shared/ui/primitives/spinner";
import { ConnectionCommandStep } from "./ClusterConnectDialogParts";
import {
  ClusterConnectProviderGrid,
  ClusterConnectSteps,
  clusterConnectProviders,
} from "./ClusterConnectDialogViews";
import { clusterResourcesHref } from "./clusterNavigation";
import { useClusterConnectDialogController } from "./useClusterConnectDialogController";

export function ClusterConnectDialog({
  existingNames,
  onConnected,
  onOpenChange,
  open,
  port,
}: {
  existingNames: readonly string[];
  onConnected: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  port: ClustersPort;
}) {
  const { reportUnauthorized } = useAuthSessionGate();
  const filter = useUnifiedFilter();
  const { formatDate, t } = useI18n();
  const {
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
  } = useClusterConnectDialogController({
    existingNames,
    onConnected,
    onOpenChange,
    open,
    port,
    reportUnauthorized,
  });
  const selectedProvider = clusterConnectProviders.find((candidate) => candidate.id === provider)
    ?? clusterConnectProviders[0];

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-2xl"
        closeLabel={t("common.action.close")}
        showCloseButton={phase !== "submitting" && phase !== "reissuing"}
      >
        <DialogHeader className="gap-3 border-b px-6 pb-5 pt-6 sm:px-8 sm:pt-7">
          <div className="flex items-center gap-3 pr-8">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-data-accent text-data-accent-foreground">
              <Server aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{t("clusters.connect.title")}</DialogTitle>
              <DialogDescription className="mt-1 leading-relaxed">
                {t("clusters.connect.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ClusterConnectSteps activeStep={step} />

        <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8">
          {step === 1 ? (
            <div className="motion-wizard-stage grid gap-5">
              <div className="flex items-start gap-3 rounded-xl border bg-muted/35 px-4 py-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-healthy" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("clusters.connect.security.outbound")}
                </p>
              </div>

              <fieldset className="grid gap-2.5">
                <div className="grid gap-0.5">
                  <legend className="text-sm font-semibold">{t("clusters.connect.provider.label")}</legend>
                  <p className="text-xs text-muted-foreground">{t("clusters.connect.provider.description")}</p>
                </div>
                <ClusterConnectProviderGrid onChange={setProvider} provider={provider} t={t} />
              </fieldset>

              <label className="grid gap-2 text-sm font-semibold">
                {t("clusters.connect.name.label")}
                <Input
                  aria-label={t("clusters.connect.name.label")}
                  aria-describedby={nameConflict ? "cluster-connect-name-error" : "cluster-connect-name-hint"}
                  aria-invalid={nameConflict || undefined}
                  autoFocus
                  className="h-11 rounded-xl bg-muted/35 px-3.5 font-mono"
                  onChange={(event) => changeName(event.currentTarget.value)}
                  placeholder={t("clusters.connect.name.placeholder")}
                  value={name}
                />
                {nameConflict ? (
                  <span className="text-xs text-destructive" id="cluster-connect-name-error" role="alert">
                    {t("clusters.connect.name.conflict")}
                  </span>
                ) : (
                  <span className="text-xs font-normal text-muted-foreground" id="cluster-connect-name-hint">
                    {t("clusters.connect.name.hint")}
                  </span>
                )}
              </label>

              <DialogFooter className="mt-1">
                <Button
                  aria-busy={phase === "submitting"}
                  className="h-11 w-full rounded-xl bg-data-accent text-data-accent-foreground hover:bg-data-accent/90"
                  disabled={!name.trim() || nameConflict || phase === "submitting"}
                  onClick={() => void register()}
                >
                  {phase === "submitting" ? <Spinner decorative /> : null}
                  {t("clusters.connect.action.register")}
                  {phase !== "submitting" ? <ChevronRight aria-hidden="true" /> : null}
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="motion-wizard-stage">
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
                providerLabel={t(selectedProvider.labelKey)}
                t={t}
              />
            </div>
          ) : null}

          {step === 3 && receipt ? (
            <div className="motion-wizard-stage grid justify-items-center gap-5 py-2 text-center">
              <span className="grid size-16 place-items-center rounded-full bg-status-healthy/15 text-status-healthy">
                <Check aria-hidden="true" className="size-8" strokeWidth={3} />
              </span>
              <div className="grid gap-1.5">
                <h3 className="text-xl font-semibold tracking-tight">{t("clusters.connect.connected.title")}</h3>
                <p className="text-sm text-muted-foreground">{t("clusters.connect.connected.description")}</p>
                <p className="font-mono text-xs text-foreground/75">{receipt.clusterId}</p>
              </div>
              <div className="grid w-full grid-cols-2 overflow-hidden rounded-xl border bg-muted/25 text-left">
                <div className="border-r px-4 py-3">
                  <p className="text-[0.6875rem] text-muted-foreground">{t("clusters.connect.connected.agent")}</p>
                  <p className="mt-1 text-sm font-semibold text-status-healthy">{t("common.state.connected")}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[0.6875rem] text-muted-foreground">{t("clusters.connect.connected.collecting")}</p>
                  <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold">
                    <span className="relative flex size-2" aria-hidden="true">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-healthy/50 motion-reduce:animate-none" />
                      <span className="relative inline-flex size-2 rounded-full bg-status-healthy" />
                    </span>
                    {t("clusters.connect.connected.realtime")}
                  </p>
                </div>
              </div>
              <Link
                className={buttonVariants({
                  className: "h-11 w-full rounded-xl bg-data-accent text-data-accent-foreground hover:bg-data-accent/90",
                })}
                to={clusterResourcesHref(filter.state, receipt.clusterId)}
              >
                {t("clusters.connect.action.view")}
              </Link>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
