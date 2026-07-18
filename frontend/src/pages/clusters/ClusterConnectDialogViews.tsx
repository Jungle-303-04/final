import { Check } from "lucide-react";
import type { ComponentType } from "react";
import type { ClusterConnectProvider } from "../../features/clusters/clustersContract";
import { ProviderLogo, type ProviderLogoKind } from "../../shared/brand/ProviderLogo";
import { cn } from "../../shared/lib/cn";
import { useI18n, type I18nController, type MessageKey } from "../../shared/i18n";
import type { ClusterConnectWizardStep } from "./useClusterConnectDialogController";

export const clusterConnectProviders: readonly {
  id: ClusterConnectProvider;
  logo: ProviderLogoKind | ComponentType<{ className?: string }>;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  tone: string;
}[] = [
  {
    id: "aws",
    logo: "eks",
    labelKey: "clusters.connect.provider.aws",
    descriptionKey: "clusters.connect.provider.aws.description",
    tone: "text-provider-aws bg-provider-aws/10",
  },
  {
    id: "gcp",
    logo: "gke",
    labelKey: "clusters.connect.provider.gcp",
    descriptionKey: "clusters.connect.provider.gcp.description",
    tone: "text-provider-gcp bg-provider-gcp/10",
  },
  {
    id: "azure",
    logo: "aks",
    labelKey: "clusters.connect.provider.azure",
    descriptionKey: "clusters.connect.provider.azure.description",
    tone: "text-provider-azure bg-provider-azure/10",
  },
  {
    id: "onprem",
    logo: "onprem",
    labelKey: "clusters.connect.provider.onprem",
    descriptionKey: "clusters.connect.provider.onprem.description",
    tone: "text-provider-local bg-provider-local/10",
  },
];

export function ClusterConnectProviderGrid({
  onChange,
  provider,
  t,
}: {
  onChange: (provider: ClusterConnectProvider) => void;
  provider: ClusterConnectProvider;
  t: I18nController["t"];
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {clusterConnectProviders.map(({ descriptionKey, id, labelKey, logo, tone }) => (
        <button
          aria-label={t(labelKey)}
          aria-pressed={provider === id}
          className={cn(
            "flex min-h-20 items-center gap-3 rounded-xl border bg-muted/35 px-3 py-3 text-left outline-none transition-[border-color,background-color,box-shadow] duration-(--motion-quick) ease-(--ease-out) hover:bg-muted/65 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
            provider === id && "border-data-accent/45 bg-card shadow-xs",
          )}
          key={id}
          onClick={() => onChange(id)}
          type="button"
        >
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", tone)}>
            <ConnectProviderLogo logo={logo} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{t(labelKey)}</span>
            <span className="mt-0.5 block truncate text-[0.6875rem] text-muted-foreground">
              {t(descriptionKey)}
            </span>
          </span>
          <span className="grid size-5 shrink-0 place-items-center" aria-hidden="true">
            <Check className="motion-selection-check size-4 text-data-accent" strokeWidth={3} />
          </span>
        </button>
      ))}
    </div>
  );
}

export function ClusterConnectSteps({ activeStep }: { activeStep: ClusterConnectWizardStep }) {
  const steps = [
    "clusters.connect.steps.info",
    "clusters.connect.steps.install",
    "clusters.connect.steps.connection",
  ] as const;
  return (
    <StepList activeStep={activeStep} steps={steps} />
  );
}

function StepList({
  activeStep,
  steps,
}: {
  activeStep: ClusterConnectWizardStep;
  steps: readonly MessageKey[];
}) {
  const { t } = useI18n();
  return (
    <ol aria-label={t("clusters.connect.steps.aria")} className="grid grid-cols-3 border-b px-6 sm:px-8">
      {steps.map((key, index) => {
        const number = index + 1;
        const complete = number < activeStep;
        const active = number === activeStep;
        return (
          <li
            aria-current={active ? "step" : undefined}
            className={cn(
              "relative flex min-w-0 items-center justify-center gap-2 py-4 text-xs font-semibold text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-data-accent after:transition-transform after:duration-(--motion-layout) after:ease-(--ease-spring) motion-reduce:after:transition-none",
              (complete || active) && "text-foreground after:scale-x-100",
            )}
            key={key}
          >
            <span className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[0.6875rem]",
              (complete || active) && "bg-data-accent text-data-accent-foreground",
            )}>
              {complete ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : number}
            </span>
            <span className="truncate">{t(key)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ConnectProviderLogo({ logo }: {
  logo: ProviderLogoKind | ComponentType<{ className?: string }>;
}) {
  if (typeof logo === "string") return <ProviderLogo className="size-5" provider={logo} />;
  const ProviderIcon = logo;
  return <ProviderIcon className="size-5" />;
}
