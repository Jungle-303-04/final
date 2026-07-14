import { Boxes, ServerCog } from "lucide-react";

import awsDarkLogo from "./aws-dark.png";
import awsLogo from "./aws.png";
import azureLogo from "./azure.svg";
import gcpLogo from "./gcp.png";

export type ProviderLogoKind = "aks" | "eks" | "gke" | "kind" | "onprem" | "unknown";

export function ProviderLogo({
  className,
  provider,
}: {
  className?: string;
  provider: ProviderLogoKind;
}) {
  if (provider === "eks") {
    return (
      <span aria-hidden="true" className={className}>
        <img alt="" className="size-full object-contain dark:hidden" src={awsLogo} />
        <img alt="" className="hidden size-full object-contain dark:block" src={awsDarkLogo} />
      </span>
    );
  }
  if (provider === "aks" || provider === "gke") {
    return (
      <img
        alt=""
        aria-hidden="true"
        className={className}
        src={provider === "aks" ? azureLogo : gcpLogo}
      />
    );
  }
  const Icon = provider === "onprem" ? ServerCog : Boxes;
  return <Icon aria-hidden="true" className={className} />;
}

