import {
  IconBrandAws,
  IconBrandAzure,
  IconBrandGoogle,
  type Icon,
} from "@tabler/icons-react";
import { Boxes, Server, ServerCog } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { HomeClusterProvider } from "../home/homeContract";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { cn } from "../../shared/ui/primitives/cn";

const providerIcons: Record<
  HomeClusterProvider,
  ComponentType<SVGProps<SVGSVGElement>> | Icon
> = {
  aks: IconBrandAzure,
  eks: IconBrandAws,
  gke: IconBrandGoogle,
  kind: Boxes,
  onprem: ServerCog,
  unknown: Server,
};

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
  const IconComponent = providerIcons[provider];
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
      <IconComponent aria-hidden="true" className="size-4" />
    </span>
  );
}
