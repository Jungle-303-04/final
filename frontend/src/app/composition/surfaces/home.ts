import type { ComponentType } from "react";
import type { HomePort } from "../../../features/home/homeContract";
import { createHomeSurface } from "../../../pages/home/createHomeSurface";

export function loadHomeSurface(homePort: HomePort): ComponentType {
  return createHomeSurface(homePort);
}
