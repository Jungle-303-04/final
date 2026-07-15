import type { ComponentType } from "react";

import { AlertsPage } from "./AlertsPage";
import type { AlertRulesPort } from "../../features/alerts/alertRulesContract";

export function createAlertsSurface(rulesPort: AlertRulesPort): ComponentType {
  function AlertsSurfaceRoute() {
    return <AlertsPage rulesPort={rulesPort} />;
  }
  AlertsSurfaceRoute.displayName = "AlertsSurfaceRoute";
  return AlertsSurfaceRoute;
}
