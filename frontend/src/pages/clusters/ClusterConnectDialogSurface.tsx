import type {
  ClusterConnectProvider,
  ClusterConnectEnvironment,
  ClusterConnectReceipt,
  ClusterConnectStage,
  ClusterConnectionSnapshot,
} from "../../features/clusters/clustersContract";
import type { I18nController } from "../../shared/i18n";
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
import type { ConnectPhase, WizardStep } from "./ClusterConnectDialogTypes";

export function ClusterConnectDialogSurface({
  connectedSnapshot,
  connectionStage,
  copyState,
  elapsedSeconds,
  environment,
  formatDate,
  href,
  name,
  nameConflict,
  onCopy,
  onNameChange,
  onEnvironmentChange,
  onOpenChange,
  onProviderChange,
  onRegister,
  onReissue,
  onRetry,
  open,
  phase,
  provider,
  receipt,
  step,
  t,
}: {
  connectedSnapshot: ClusterConnectionSnapshot | null;
  connectionStage: ClusterConnectStage;
  copyState: "idle" | "copied" | "failed";
  elapsedSeconds: number;
  environment: ClusterConnectEnvironment;
  formatDate: I18nController["formatDate"];
  href: string | null;
  name: string;
  nameConflict: boolean;
  onCopy: () => void;
  onNameChange: (name: string) => void;
  onEnvironmentChange: (environment: ClusterConnectEnvironment) => void;
  onOpenChange: (open: boolean) => void;
  onProviderChange: (provider: ClusterConnectProvider) => void;
  onRegister: () => void;
  onReissue: () => void;
  onRetry: () => void;
  open: boolean;
  phase: ConnectPhase;
  provider: ClusterConnectProvider;
  receipt: ClusterConnectReceipt | null;
  step: WizardStep;
  t: I18nController["t"];
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
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
            environment={environment}
            onEnvironmentChange={onEnvironmentChange}
            onNameChange={onNameChange}
            onProviderChange={onProviderChange}
            onRegister={onRegister}
            phase={phase}
            provider={provider}
            t={t}
          />
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
              onCopy={onCopy}
              onReissue={onReissue}
              onRetry={onRetry}
              phase={phase}
              t={t}
            />
          </div>
        ) : null}

        {step === 3 && receipt && href ? (
          <ClusterConnectedStep
            agentVersion={connectedSnapshot?.agentVersion ?? null}
            clusterId={receipt.clusterId}
            environment={environment}
            formatDate={formatDate}
            href={href}
            lastSeenAt={connectedSnapshot?.lastSeenAt ?? null}
            t={t}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
