import type { ComponentType } from "react";
import { createSettingsSurface } from "../../../pages/settings/createSettingsSurface";
import type { SettingsPort } from "../../../features/settings/settingsContract";
import type { ShellStatePort } from "../../../features/shell-state/shellStateContract";

export function loadSettingsSurface(
  settingsPort: SettingsPort,
  shellStatePort: ShellStatePort,
): ComponentType {
  return createSettingsSurface(settingsPort, shellStatePort);
}
