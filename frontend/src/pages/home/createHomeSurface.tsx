import type { ComponentType } from "react";
import type { HomePort } from "../../features/home/homeContract";
import { HomePage } from "./HomePage";

export function createHomeSurface(port: HomePort): ComponentType {
  function HomeSurface() {
    return <HomePage port={port} />;
  }

  HomeSurface.displayName = "HomeSurface";
  return HomeSurface;
}
