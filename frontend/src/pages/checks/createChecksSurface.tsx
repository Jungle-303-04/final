import type { ComponentType } from "react";

import type { ChecksPort } from "../../features/checks/checksContract";
import { ChecksPage } from "./ChecksPage";

export function createChecksSurface(port: ChecksPort): ComponentType {
  function ChecksSurface() {
    return <ChecksPage port={port} />;
  }
  ChecksSurface.displayName = "ChecksSurface";
  return ChecksSurface;
}
