import type { ComponentType } from "react";
import type { AlertRulesPort } from "../../../features/alerts/alertRulesContract";
import { createAlertsSurface } from "../../../pages/alerts/createAlertsSurface";

export function loadAlertsSurface(alertRulesPort: AlertRulesPort): ComponentType {
  return createAlertsSurface(alertRulesPort);
}
