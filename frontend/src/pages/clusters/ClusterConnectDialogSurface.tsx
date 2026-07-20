import { Check, Server } from "lucide-react";
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
        className="z-[90] max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[1.75rem] bg-background p-0 shadow-2xl ring-black/5 sm:max-w-[37.25rem] [&_[data-slot=dialog-close]]:top-7 [&_[data-slot=dialog-close]]:right-7"
        closeLabel={t("common.action.close")}
        overlayClassName="z-[89]"
        showCloseButton={phase !== "submitting" && phase !== "reissuing"}
      >
        <DialogHeader className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4 gap-y-1 border-b px-7 pt-7 pb-6 pr-16 sm:px-[1.875rem] sm:pt-[1.875rem] sm:pr-16">
          <span className="row-span-2 grid size-[3.25rem] place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_var(--color-primary)]">
            <Server aria-hidden="true" className="size-6" />
          </span>
          <DialogTitle className="self-end text-xl leading-6 font-bold tracking-[-0.02em]">
            {t("clusters.connect.title")}
          </DialogTitle>
          <DialogDescription className="self-start text-[0.8125rem] leading-5">
            {t("clusters.connect.description")}
          </DialogDescription>
        </DialogHeader>

        <ClusterConnectWizardSteps step={step} t={t} />

        <div className="px-7 pt-6 pb-7 sm:px-[1.875rem] sm:pb-[1.875rem]">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

const wizardStepLabels = [
  "clusters.connect.step.information",
  "clusters.connect.step.installation",
  "clusters.connect.step.connection",
] as const;

function ClusterConnectWizardSteps({
  step,
  t,
}: {
  step: WizardStep;
  t: I18nController["t"];
}) {
  return (
    <ol
      aria-label={t("clusters.connect.progress.aria")}
      className="flex items-center px-7 pt-7 sm:px-[1.875rem]"
    >
      {wizardStepLabels.map((labelKey, index) => {
        const number = (index + 1) as WizardStep;
        const active = number === step;
        const complete = number < step;
        return (
          <li
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 flex-1 items-center last:flex-none"
            key={labelKey}
          >
            <span
              className={[
                "grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors",
                active
                  ? "bg-primary text-primary-foreground ring-[0.3125rem] ring-primary/15"
                  : complete
                    ? "bg-primary/12 text-primary"
                    : "bg-muted text-muted-foreground/70",
              ].join(" ")}
            >
              {complete ? <Check aria-hidden="true" className="size-4" /> : number}
            </span>
            <span className={active || complete ? "ml-3 shrink-0 font-bold" : "ml-3 shrink-0 font-semibold text-muted-foreground/70"}>
              {t(labelKey)}
            </span>
            {number < 3 ? <span aria-hidden="true" className="mx-4 h-0.5 min-w-6 flex-1 rounded-full bg-border" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
