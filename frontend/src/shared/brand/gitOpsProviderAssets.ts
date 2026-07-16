import argoCdLogo from "./gitops/argocd.png";
import fluxLogo from "./gitops/flux.svg";

export type GitOpsProvider = "argocd" | "flux";

export interface GitOpsProviderAsset {
  readonly label: string;
  readonly src: string;
}

/**
 * Product-owned registry for provider marks that may be rendered by GitOps,
 * application, or topology surfaces.  The registry deliberately has no
 * source-runtime dependency: callers use a provider identity, not a file path.
 */
export const GITOPS_PROVIDER_ASSETS: Readonly<Record<GitOpsProvider, GitOpsProviderAsset>> =
  Object.freeze({
    argocd: Object.freeze({ label: "Argo CD", src: argoCdLogo }),
    flux: Object.freeze({ label: "Flux", src: fluxLogo }),
  });
