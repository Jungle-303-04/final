import type { HomePort } from "../../features/home/homeContract";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";

export function acquireHomeRequest<T>(
  port: HomePort,
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): ReturnType<typeof acquireSharedRequest<T>> {
  return acquireSharedRequest(port, key, load);
}
