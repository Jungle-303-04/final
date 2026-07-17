import { createElement } from "react";

import { SettingsPage } from "./SettingsPage";
import type { SettingsPort } from "../../features/settings/settingsContract";
import type { ShellStatePort } from "../../features/shell-state/shellStateContract";

export function createSettingsSurface(
  settingsPort: SettingsPort,
  shellStatePort: ShellStatePort,
) {
  return function SettingsSurface() {
    return createElement(SettingsPage, { settingsPort, shellStatePort });
  };
}
