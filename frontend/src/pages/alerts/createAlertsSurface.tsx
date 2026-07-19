import type { ComponentType } from "react";

import type { AlertChannelsPort } from "../../features/alerts/alertChannelsContract";
import type { AlertRulesPort } from "../../features/alerts/alertRulesContract";
import { AlertsPage } from "./AlertsPage";

export function createAlertsSurface(
  rulesPort: AlertRulesPort,
  channelsPort: AlertChannelsPort,
): ComponentType {
  function AlertsSurfaceRoute() {
    return <AlertsPage channelsPort={channelsPort} rulesPort={rulesPort} />;
  }
  AlertsSurfaceRoute.displayName = "AlertsSurfaceRoute";
  return AlertsSurfaceRoute;
}
