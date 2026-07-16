import { z } from "zod";

import type {
  DesktopBridge,
  DesktopPortForwardSession,
} from "../../desktop/desktopBridge";
import {
  loadInjectedBrowserRefreshPolicy,
  type BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";
import type {
  PortForwardSession,
  PortForwardSessionPort,
} from "./portForwardSessionContract";

const port = z.number().int().min(1).max(65_535);
const sessionSchema = z.strictObject({
  id: z.string().min(1),
  clusterId: z.string().min(1),
  namespace: z.string().min(1),
  podName: z.string().min(1),
  podPort: port,
  localPort: port,
  listenAddress: z.enum(["127.0.0.1", "0.0.0.0"]),
  serviceName: z.string().min(1).nullable(),
  servicePort: port.nullable(),
  scheme: z.enum(["http", "https"]).nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  status: z.enum(["running", "stopped", "error"]),
  error: z.string().min(1).nullable(),
}).superRefine((value, context) => {
  if ((value.serviceName === null) !== (value.servicePort === null)) {
    context.addIssue({ code: "custom", message: "service identity and port must be present together" });
  }
  if (value.status === "error" && value.error === null) {
    context.addIssue({ code: "custom", message: "failed port-forward session requires an error" });
  }
  if (value.status !== "error" && value.error !== null) {
    context.addIssue({ code: "custom", message: "healthy port-forward session cannot carry an error" });
  }
});
const sessionListSchema = z.array(sessionSchema).superRefine((sessions, context) => {
  const ids = sessions.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "port-forward session ids must be unique" });
  }
});

export function createPortForwardSessionAdapter(
  desktop: Pick<
    DesktopBridge,
    "isDesktop" | "listPortForwardSessions" | "stopPortForwardSession"
  >,
  refreshPolicies?: BrowserRefreshPolicyRegistry<"port_sessions">,
): PortForwardSessionPort {
  return {
    available: desktop.isDesktop,
    async list(signal) {
      signal?.throwIfAborted();
      const [nativeSessions, refreshPolicy] = await Promise.all([
        desktop.listPortForwardSessions(),
        loadInjectedBrowserRefreshPolicy(refreshPolicies, "port_sessions", signal),
      ]);
      signal?.throwIfAborted();
      if (refreshPolicy.postMutationRefreshAfterSeconds === null) {
        throw new TypeError("port session mutation refresh policy is unavailable");
      }
      return {
        sessions: canonicalSessions(nativeSessions),
        refreshPolicy,
      };
    },
    async stop(sessionId, signal) {
      signal?.throwIfAborted();
      const normalized = sessionId.trim();
      if (!normalized) throw new TypeError("port-forward session id is required");
      await desktop.stopPortForwardSession(normalized);
      signal?.throwIfAborted();
    },
  };
}

function canonicalSessions(value: readonly DesktopPortForwardSession[]): readonly PortForwardSession[] {
  return sessionListSchema.parse(value).sort((left, right) => (
    left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id)
  ));
}
