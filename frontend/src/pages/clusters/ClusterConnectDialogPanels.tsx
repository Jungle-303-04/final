import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  ClusterConnectEnvironment,
  ClusterConnectProvider,
} from "../../features/clusters/clustersContract";
import { ProviderLogo, type ProviderLogoKind } from "../../shared/brand/ProviderLogo";
import type { I18nController, MessageKey } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { Button, buttonVariants } from "../../shared/ui/primitives/button";
import { DialogFooter } from "../../shared/ui/primitives/dialog";
import { Input } from "../../shared/ui/primitives/input";
import { Spinner } from "../../shared/ui/primitives/spinner";
import type { ConnectPhase } from "./ClusterConnectDialogTypes";

const providers: readonly {
  id: ClusterConnectProvider;
  logo: ProviderLogoKind;
  labelKey: MessageKey;
}[] = [
  { id: "aws", logo: "eks", labelKey: "clusters.connect.provider.aws" },
  { id: "gcp", logo: "gke", labelKey: "clusters.connect.provider.gcp" },
  { id: "azure", logo: "aks", labelKey: "clusters.connect.provider.azure" },
  { id: "onprem", logo: "onprem", labelKey: "clusters.connect.provider.onprem" },
];
const environments: readonly {
  id: ClusterConnectEnvironment;
  labelKey: MessageKey;
}[] = [
  { id: "development", labelKey: "clusters.connect.environment.development" },
  { id: "staging", labelKey: "clusters.connect.environment.staging" },
  { id: "production", labelKey: "clusters.connect.environment.production" },
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
    <div className="motion-wizard-stage grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          {t("clusters.connect.provider.label")}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {providers.map(({ id, logo, labelKey }) => (
            <button
              aria-pressed={provider === id}
              className={cn(
                "grid min-h-24 place-items-center gap-2 rounded-xl border bg-card p-3 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                provider === id && "border-ring bg-muted",
              )}
              key={id}
              onClick={() => onProviderChange(id)}
              type="button"
            >
              <ProviderLogo className="size-6" provider={logo} />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-2 text-sm font-medium">
        {t("clusters.connect.name.label")}
        <Input
          aria-describedby={nameConflict ? "cluster-connect-name-error" : undefined}
          aria-invalid={nameConflict || undefined}
          autoFocus
          onChange={(event) => onNameChange(event.currentTarget.value)}
          placeholder={t("clusters.connect.name.placeholder")}
          value={name}
        />
        {nameConflict ? (
          <span className="text-xs text-destructive" id="cluster-connect-name-error" role="alert">
            {t("clusters.connect.name.conflict")}
          </span>
        ) : null}
      </label>
      <fieldset className="grid gap-2">
        <legend className="flex items-baseline gap-2 text-sm font-medium">
          <span>{t("clusters.connect.environment.label")}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {t("clusters.connect.environment.hint")}
          </span>
        </legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {environments.map(({ id, labelKey }) => (
            <button
              aria-pressed={environment === id}
              className={cn(
                "min-w-0 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground outline-none transition-[background-color,box-shadow,color] duration-(--motion-quick) ease-(--ease-soft) hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                environment === id && "bg-card text-foreground shadow-xs",
              )}
              key={id}
              onClick={() => onEnvironmentChange(id)}
              type="button"
            >
              <span className="block truncate">{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <DialogFooter className="mt-1">
        <Button
          aria-busy={phase === "submitting"}
          disabled={!name.trim() || nameConflict || phase === "submitting"}
          onClick={onRegister}
        >
          {phase === "submitting" ? <Spinner decorative /> : null}
          {t("clusters.connect.action.register")}
        </Button>
      </DialogFooter>
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
