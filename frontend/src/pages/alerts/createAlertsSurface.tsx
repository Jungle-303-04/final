import type { ComponentType } from "react";

import { AlertsPage } from "./AlertsPage";

export function createAlertsSurface(): ComponentType {
  function AlertsSurfaceRoute() {
    return <AlertsPage />;
  }
  AlertsSurfaceRoute.displayName = "AlertsSurfaceRoute";
  return AlertsSurfaceRoute;
}
