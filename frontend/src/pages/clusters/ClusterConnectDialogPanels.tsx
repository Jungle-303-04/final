import { ArrowRight, Check, Server } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  ClusterConnectEnvironment,
  ClusterConnectProvider,
} from "../../features/clusters/clustersContract";
import { ProviderLogo, type ProviderLogoKind } from "../../shared/brand/ProviderLogo";
import type { I18nController, MessageKey } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Button, buttonVariants } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import { Spinner } from "../../shared/ui/primitives/spinner";
import type { ConnectPhase } from "./ClusterConnectDialogTypes";

const providers: readonly {
  displayName: string;
  id: ClusterConnectProvider;
  logo: ProviderLogoKind;
  labelKey: MessageKey;
  subLabel: string;
}[] = [
  { displayName: "Amazon EKS", id: "aws", logo: "eks", labelKey: "clusters.connect.provider.aws", subLabel: "AWS" },
  { displayName: "Google GKE", id: "gcp", logo: "gke", labelKey: "clusters.connect.provider.gcp", subLabel: "GCP" },
  { displayName: "Azure AKS", id: "azure", logo: "aks", labelKey: "clusters.connect.provider.azure", subLabel: "Azure" },
  { displayName: "Docker", id: "onprem", logo: "docker", labelKey: "clusters.connect.provider.onprem", subLabel: "Local Kubernetes" },
];
const environments: readonly {
  displayLabel: string;
  id: ClusterConnectEnvironment;
  labelKey: MessageKey;
}[] = [
  { displayLabel: "dev", id: "development", labelKey: "clusters.connect.environment.development" },
  { displayLabel: "staging", id: "staging", labelKey: "clusters.connect.environment.staging" },
  { displayLabel: "prod", id: "production", labelKey: "clusters.connect.environment.production" },
];

export function ClusterRegistrationStep({
  environment,
  name,
  nameConflict,
  onEnvironmentChange,
  onNameChange,
  onProviderChange,
  onRegister,
  phase,
  provider,
  t,
}: {
  environment: ClusterConnectEnvironment;
  name: string;
  nameConflict: boolean;
  onEnvironmentChange: (environment: ClusterConnectEnvironment) => void;
  onNameChange: (name: string) => void;
  onProviderChange: (provider: ClusterConnectProvider) => void;
  onRegister: () => void;
  phase: ConnectPhase;
  provider: ClusterConnectProvider;
  t: I18nController["t"];
}) {
  return (
    <div className="motion-wizard-stage grid gap-6">
      <fieldset className="grid gap-2.5">
        <legend className="mb-1 text-[0.8125rem] font-semibold text-muted-foreground">
          {t("clusters.connect.provider.label")}
        </legend>
        <div className="grid grid-cols-2 gap-2.5">
          {providers.map(({ displayName, id, logo, labelKey, subLabel }) => (
            <button
              aria-label={t(labelKey)}
              aria-pressed={provider === id}
              className={cn(
                "relative grid min-h-16 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2 rounded-[0.875rem] border border-transparent bg-muted/80 px-2.5 py-2.5 pr-7 text-left outline-none transition-[background-color,border-color,box-shadow] hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:gap-3 sm:px-3.5 sm:pr-8 motion-reduce:transition-none",
                provider === id && "border-primary/50 bg-card shadow-sm",
              )}
              key={id}
              onClick={() => onProviderChange(id)}
              type="button"
            >
              <span className={cn(
                "grid size-9 place-items-center rounded-[0.625rem]",
                id === "aws" ? "bg-orange-500/10 text-orange-500" : "bg-primary/10 text-primary",
              )}>
                <ProviderLogo className="size-5" provider={logo} />
              </span>
              <span className="min-w-0 text-center">
                <span className="block truncate text-[0.8125rem] font-bold text-foreground">{displayName}</span>
                <span className="mt-0.5 block truncate text-[0.6875rem] text-muted-foreground">{subLabel}</span>
              </span>
              <span className="absolute right-2.5 grid size-[1.125rem] place-items-center sm:right-3.5">
                {provider === id ? <Check aria-hidden="true" className="size-[1.125rem] text-primary" strokeWidth={3} /> : null}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-2.5 text-[0.8125rem] font-semibold text-muted-foreground">
        <span>{t("clusters.connect.name.label")}</span>
        <span className="relative block">
          <Server aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 z-10 size-[1.125rem] -translate-y-1/2 text-muted-foreground/70" />
          <Input
            aria-describedby={nameConflict ? "cluster-connect-name-error" : undefined}
            aria-invalid={nameConflict || undefined}
            autoFocus
            className="h-14 rounded-[0.875rem] border-transparent bg-muted/80 pr-4 pl-12 font-mono text-sm shadow-none focus-visible:bg-background"
            onChange={(event) => onNameChange(event.currentTarget.value)}
            placeholder={t("clusters.connect.name.placeholder")}
            value={name}
          />
        </span>
        {nameConflict ? (
          <span className="text-xs text-destructive" id="cluster-connect-name-error" role="alert">
            {t("clusters.connect.name.conflict")}
          </span>
        ) : null}
      </label>
      <fieldset className="grid gap-2.5">
        <legend className="flex items-baseline gap-2 text-[0.8125rem] font-semibold text-muted-foreground">
          <span>{t("clusters.connect.environment.label")}</span>
          <span className="text-[0.6875rem] font-normal text-muted-foreground/70">
            {t("clusters.connect.environment.hint")}
          </span>
        </legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {environments.map(({ displayLabel, id, labelKey }) => (
            <button
              aria-label={t(labelKey)}
              aria-pressed={environment === id}
              className={cn(
                "min-w-0 rounded-[0.625rem] px-2 py-2.5 text-sm font-bold text-muted-foreground/65 outline-none transition-[background-color,box-shadow,color] duration-(--motion-quick) ease-(--ease-soft) hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                environment === id && "bg-card text-foreground shadow-xs",
              )}
              key={id}
              onClick={() => onEnvironmentChange(id)}
              type="button"
            >
              <span className="block truncate">{displayLabel}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <Button
        aria-busy={phase === "submitting"}
        className="h-[3.375rem] w-full rounded-[0.875rem] text-[0.9375rem] font-bold shadow-sm"
        disabled={!name.trim() || nameConflict || phase === "submitting"}
        onClick={onRegister}
      >
        {phase === "submitting" ? <Spinner decorative /> : null}
        {t("clusters.connect.action.register")}
        {phase !== "submitting" ? <ArrowRight aria-hidden="true" className="size-[1.125rem]" /> : null}
      </Button>
    </div>
  );
}

export function ClusterConnectedStep({
  agentVersion,
  clusterId,
  environment,
  formatDate,
  href,
  lastSeenAt,
  t,
}: {
  agentVersion: string | null;
  clusterId: string;
  environment: ClusterConnectEnvironment;
  formatDate: I18nController["formatDate"];
  href: string;
  lastSeenAt: string | null;
  t: I18nController["t"];
}) {
  return (
    <div className="motion-wizard-stage grid justify-items-center gap-4 py-6 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-status-healthy/15 text-status-healthy">
        <Check aria-hidden="true" className="size-6" />
      </span>
      <div className="grid gap-1">
        <h3 className="text-lg font-semibold">{t("clusters.connect.connected.title")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("clusters.connect.connected.description")}
        </p>
      </div>
      <dl className="grid w-full min-w-0 grid-cols-3 overflow-hidden rounded-xl border bg-card text-left">
        <div className="min-w-0 border-r px-4 py-3">
          <dt className="text-xs font-medium text-muted-foreground">
            {t("clusters.connect.install.target.cluster")}
          </dt>
          <dd className="mt-1 truncate font-mono text-sm font-semibold" title={clusterId}>
            {clusterId}
          </dd>
        </div>
        <div className="min-w-0 border-r px-4 py-3">
          <dt className="text-xs font-medium text-muted-foreground">
            {t("clusters.connect.environment.label")}
          </dt>
          <dd className="mt-1 truncate text-sm font-semibold">
            {t(`clusters.connect.environment.${environment}`)}
          </dd>
        </div>
        <div className="min-w-0 px-4 py-3">
          <dt className="text-xs font-medium text-muted-foreground">
            {t("clusters.connect.connected.metric.version")}
          </dt>
          <dd className="mt-1 truncate font-mono text-sm font-semibold">
            {agentVersion ?? "—"}
          </dd>
        </div>
      </dl>
      <div className="flex w-full min-w-0 items-center gap-2.5 rounded-xl bg-muted/60 px-4 py-3 text-left">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-healthy/35 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-status-healthy" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {t("clusters.connect.connected.collecting")}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {lastSeenAt
            ? t("clusters.lastResponse", { time: formatDate(new Date(lastSeenAt)) })
            : t("clusters.connect.connected.live")}
        </span>
      </div>
      <Link className={buttonVariants()} to={href}>
        {t("clusters.connect.action.view")}
      </Link>
    </div>
  );
}
