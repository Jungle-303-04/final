import type { HomeClusterProvider } from "../home/homeContract";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { ProviderLogo } from "../../shared/brand/ProviderLogo";
import { cn } from "../../shared/lib/cn";

const providerLabelKeys: Record<HomeClusterProvider, MessageKey> = {
  aks: "clusterScope.provider.aks",
  eks: "clusterScope.provider.eks",
  gke: "clusterScope.provider.gke",
  kind: "clusterScope.provider.kind",
  onprem: "clusterScope.provider.onprem",
  unknown: "clusterScope.provider.unknown",
};

export function ClusterProviderIcon({
  className,
  provider,
}: {
  className?: string;
  provider: HomeClusterProvider;
}) {
  const { t } = useI18n();
  const label = t(providerLabelKeys[provider]);

  return (
    <span
      aria-label={label}
      className={cn("inline-grid size-4 shrink-0 place-items-center", className)}
      data-provider={provider}
      data-slot="cluster-provider-icon"
      role="img"
      title={label}
    >
      <ProviderLogo className="size-4" provider={provider} />
    </span>
  );
}
