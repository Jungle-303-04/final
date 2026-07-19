import type { ComponentType } from "react";
import type { HomePort } from "../../../features/home/homeContract";
import type { HomeBoardPorts } from "../../../pages/home/useHomeBoardData";
import { createHomeSurface } from "../../../pages/home/createHomeSurface";
import { createClustersProductPort } from "./clusters";

export function loadHomeSurface(
  homePort: HomePort,
  boardPorts: HomeBoardPorts,
): ComponentType {
  return createHomeSurface(homePort, boardPorts, createClustersProductPort());
}
