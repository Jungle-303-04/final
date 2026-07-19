import type { ComponentType } from "react";

import type { AlertChannelsPort } from "../../../features/alerts/alertChannelsContract";
import type { AlertRulesPort } from "../../../features/alerts/alertRulesContract";
import { createAlertsSurface } from "../../../pages/alerts/createAlertsSurface";

export function loadAlertsSurface(
  rulesPort: AlertRulesPort,
  channelsPort: AlertChannelsPort,
): ComponentType {
  return createAlertsSurface(rulesPort, channelsPort);
}
