import type {
  DesktopBridge,
  DesktopCapabilitySet,
} from "../../desktop/desktopBridge";
import {
  type BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";
import type { PortForwardSessionPort } from "./portForwardSessionContract";

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
export function createPortForwardSessionAdapter(
  _desktop: PortForwardDesktopBoundary,
  _refreshPolicies?: BrowserRefreshPolicyRegistry<"port_sessions">,
): PortForwardSessionPort {
  return {
    // Fail closed until the native listener is connected to the audited
    // gateway -> cluster-agent stream. Desktop presence alone is not a target
    // transport capability.
    available: false,
    async list(signal) {
      signal?.throwIfAborted();
      throw agentTunnelUnavailable();
    },
    async start(_request, signal) {
      signal?.throwIfAborted();
      throw agentTunnelUnavailable();
    },
    async stop(_sessionId, signal) {
      signal?.throwIfAborted();
      throw agentTunnelUnavailable();
    },
    async recreate(_sessionId, signal) {
      signal?.throwIfAborted();
      throw agentTunnelUnavailable();
    },
  };
}

function agentTunnelUnavailable(): TypeError {
  return new TypeError("agent-backed port-forward tunnel is unavailable");
}
