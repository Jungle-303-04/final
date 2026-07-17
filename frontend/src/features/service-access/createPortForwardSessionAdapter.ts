import { z } from "zod";

import type {
  DesktopBridge,
  DesktopCapabilitySet,
  DesktopPortForwardSession,
} from "../../desktop/desktopBridge";
import {
  loadInjectedBrowserRefreshPolicy,
  type BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";
import type {
  PortForwardSession,
  PortForwardSessionPort,
  PortForwardStartReceipt,
} from "./portForwardSessionContract";

const port = z.number().int().min(1).max(65_535);
const sessionSchema = z.strictObject({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  clusterId: z.string().min(1),
  freshness: z.enum(["live", "stale", "partial", "disconnected"]),
  namespace: z.string().min(1),
  resourceKind: z.enum(["Pod", "Service"]),
  resourceName: z.string().min(1),
  resourceUid: z.string().min(1),
  podName: z.string().min(1).nullable(),
  podPort: port,
  localPort: port,
  listenAddress: z.enum(["127.0.0.1", "0.0.0.0"]),
  serviceName: z.string().min(1).nullable(),
  servicePort: port.nullable(),
  scheme: z.enum(["http", "https"]).nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  status: z.enum(["starting", "running", "stopped", "error"]),
  error: z.string().min(1).nullable(),
  exitCode: z.number().int().nullable(),
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
  if (value.resourceKind === "Pod") {
    if (value.podName !== value.resourceName || value.serviceName !== null || value.servicePort !== null) {
      context.addIssue({ code: "custom", message: "Pod port-forward identity is inconsistent" });
    }
  } else if (
    value.serviceName !== value.resourceName
    || value.servicePort === null
  ) {
    context.addIssue({ code: "custom", message: "Service port-forward identity is inconsistent" });
  }
  if (
    (value.status === "starting" || value.status === "running")
    && value.exitCode !== null
  ) {
    context.addIssue({ code: "custom", message: "active port-forward session cannot have an exit code" });
  }
});
const startRequestSchema = z.strictObject({
  scope: z.strictObject({
    workspaceId: z.string().min(1).max(240),
    clusterId: z.string().min(1).max(240),
    namespaces: z.array(z.string().min(1).max(63)),
    freshness: z.enum(["live", "stale", "partial", "disconnected"]),
  }),
  resource: z.strictObject({
    apiGroup: z.enum(["", "core"]),
    version: z.literal("v1"),
    kind: z.enum(["Pod", "Service"]),
    namespace: z.string().min(1).max(63),
    name: z.string().min(1).max(253),
    uid: z.string().min(1).max(240),
  }),
  remotePort: port,
  localPort: port.nullable(),
  listenAddress: z.literal("127.0.0.1"),
  confirmation: z.literal(true),
}).superRefine((value, context) => {
  if (new Set(value.scope.namespaces).size !== value.scope.namespaces.length) {
    context.addIssue({ code: "custom", message: "port-forward namespace scope must be unique" });
  }
  if (
    value.scope.namespaces.length > 0
    && !value.scope.namespaces.includes(value.resource.namespace)
  ) {
    context.addIssue({ code: "custom", message: "port-forward target is outside namespace scope" });
  }
});
const startReceiptSchema = z.strictObject({
  sessionId: z.uuid(),
  generation: z.number().int().positive(),
  localPort: port,
  startedAt: z.iso.datetime({ offset: true }),
});

type PortForwardDesktopBoundary = Pick<
  DesktopBridge,
  | "isDesktop"
  | "listPortForwardSessions"
  | "startPortForward"
  | "stopPortForwardSession"
  | "recreatePortForward"
> & {
  capabilities(): Promise<Pick<DesktopCapabilitySet, "portForwardSessions">>;
};
const sessionListSchema = z.array(sessionSchema).superRefine((sessions, context) => {
  const ids = sessions.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "port-forward session ids must be unique" });
  }
});

export function createPortForwardSessionAdapter(
  desktop: PortForwardDesktopBoundary,
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
    async start(request, signal) {
      signal?.throwIfAborted();
      await requireNativeCapability(desktop);
      const exact = startRequestSchema.parse(request);
      const receipt = await desktop.startPortForward(exact);
      signal?.throwIfAborted();
      return toStartReceipt(receipt);
    },
    async stop(sessionId, signal) {
      signal?.throwIfAborted();
      const normalized = sessionId.trim();
      if (!normalized) throw new TypeError("port-forward session id is required");
      await desktop.stopPortForwardSession(normalized);
      signal?.throwIfAborted();
    },
    async recreate(sessionId, signal) {
      signal?.throwIfAborted();
      await requireNativeCapability(desktop);
      const normalized = sessionId.trim();
      if (!normalized) throw new TypeError("port-forward session id is required");
      const receipt = await desktop.recreatePortForward(normalized);
      signal?.throwIfAborted();
      return toStartReceipt(receipt);
    },
  };
}

async function requireNativeCapability(desktop: PortForwardDesktopBoundary): Promise<void> {
  if (!desktop.isDesktop) throw new TypeError("native port-forward capability is unavailable");
  const capabilities = await desktop.capabilities();
  if (capabilities.portForwardSessions.state !== "available") {
    throw new TypeError(
      capabilities.portForwardSessions.reason ?? "native port-forward capability is unavailable",
    );
  }
}

function toStartReceipt(value: unknown): PortForwardStartReceipt {
  return startReceiptSchema.parse(value);
}

function canonicalSessions(value: readonly DesktopPortForwardSession[]): readonly PortForwardSession[] {
  return sessionListSchema.parse(value).sort((left, right) => (
    left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id)
  ));
}
