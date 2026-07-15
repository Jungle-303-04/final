import type { ComponentType } from "react";
import { createSettingsSurface } from "../../../pages/settings/createSettingsSurface";

export function loadSettingsSurface(): ComponentType {
  return createSettingsSurface();
}
