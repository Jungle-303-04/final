import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import type { ClusterConnectProvider } from "../../features/clusters/clustersContract";
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

export function ClusterRegistrationStep({
  name,
  nameConflict,
  onNameChange,
  onProviderChange,
  onRegister,
  phase,
  provider,
  t,
}: {
  name: string;
  nameConflict: boolean;
  onNameChange: (name: string) => void;
  onProviderChange: (provider: ClusterConnectProvider) => void;
  onRegister: () => void;
  phase: ConnectPhase;
  provider: ClusterConnectProvider;
  t: I18nController["t"];
}) {
  return (
    <div className="motion-wizard-stage grid gap-5">
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
  href,
  t,
}: {
  href: string;
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
      <Link className={buttonVariants()} to={href}>
        {t("clusters.connect.action.view")}
      </Link>
    </div>
  );
}
