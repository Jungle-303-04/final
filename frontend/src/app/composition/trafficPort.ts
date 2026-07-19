import {
  connectTrafficSource,
  getTrafficOverview,
  getTrafficSources,
  setTrafficSource,
} from "../../api";
import { createTrafficAdapter } from "../../features/traffic/createTrafficAdapter";

export function createTrafficProductPort() {
  return createTrafficAdapter({
    connectTrafficSource,
    getTrafficOverview,
    getTrafficSources,
    setTrafficSource,
  });
}
