import type { ComponentType } from "react";
import type { GitOpsPort } from "../../features/gitops/gitOpsContract";
import { GitOpsPage } from "./GitOpsPage";

export function createGitOpsSurface(port: GitOpsPort): ComponentType {
  function GitOpsSurface() {
    return <GitOpsPage port={port} />;
  }

  GitOpsSurface.displayName = "GitOpsSurface";
  return GitOpsSurface;
}
