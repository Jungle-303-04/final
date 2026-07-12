import type { AuthPort, AuthSessionResult } from "./authContract";

interface SessionRequest {
  controller: AbortController;
  promise: Promise<AuthSessionResult>;
  refCount: number;
}

const sessionRequests = new WeakMap<AuthPort, SessionRequest>();

export function acquireSessionRequest(port: AuthPort) {
  let request = sessionRequests.get(port);
  if (!request) {
    const controller = new AbortController();
    request = {
      controller,
      promise: port.loadSession(controller.signal).finally(() => {
        if (sessionRequests.get(port) === request) sessionRequests.delete(port);
      }),
      refCount: 0,
    };
    sessionRequests.set(port, request);
  }

  request.refCount += 1;

  return {
    promise: request.promise,
    release() {
      request.refCount -= 1;
      queueMicrotask(() => {
        if (request.refCount === 0 && sessionRequests.get(port) === request) {
          request.controller.abort();
          sessionRequests.delete(port);
        }
      });
    },
  };
}
