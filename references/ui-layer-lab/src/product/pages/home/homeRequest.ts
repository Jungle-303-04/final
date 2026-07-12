import type { HomePort } from "../../features/home/homeContract";

interface SharedRequest<T> {
  controller: AbortController;
  consumers: number;
  promise: Promise<T>;
  settled: boolean;
}

interface AcquiredRequest<T> {
  promise: Promise<T>;
  release: () => void;
}

const requestRegistry = new WeakMap<HomePort, Map<string, SharedRequest<unknown>>>();

export function acquireHomeRequest<T>(
  port: HomePort,
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): AcquiredRequest<T> {
  let portRequests = requestRegistry.get(port);
  if (!portRequests) {
    portRequests = new Map();
    requestRegistry.set(port, portRequests);
  }

  let request = portRequests.get(key) as SharedRequest<T> | undefined;
  if (!request) {
    const controller = new AbortController();
    request = {
      controller,
      consumers: 0,
      promise: load(controller.signal),
      settled: false,
    };
    portRequests.set(key, request as SharedRequest<unknown>);
    void request.promise.then(
      () => { request!.settled = true; },
      () => { request!.settled = true; },
    );
  }

  request.consumers += 1;
  let released = false;
  return {
    promise: request.promise,
    release() {
      if (released) return;
      released = true;
      request!.consumers -= 1;
      queueMicrotask(() => {
        if (request!.consumers !== 0) return;
        if (!request!.settled) request!.controller.abort();
        if (portRequests!.get(key) === request) portRequests!.delete(key);
        if (portRequests!.size === 0) requestRegistry.delete(port);
      });
    },
  };
}
