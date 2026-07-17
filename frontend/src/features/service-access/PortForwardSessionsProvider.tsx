import { createContext, useContext, type ReactNode } from "react";

import type { PortForwardSessionPort } from "./portForwardSessionContract";
import {
  usePortForwardSessions,
  type PortForwardSessionsController,
} from "./usePortForwardSessions";

const PortForwardSessionsContext = createContext<PortForwardSessionsController | null>(null);

export function PortForwardSessionsProvider({
  children,
  port,
}: {
  children: ReactNode;
  port: PortForwardSessionPort;
}) {
  const controller = usePortForwardSessions(port);
  return (
    <PortForwardSessionsContext.Provider value={controller}>
      {children}
    </PortForwardSessionsContext.Provider>
  );
}

export function usePortForwardSessionsController(): PortForwardSessionsController {
  const controller = useContext(PortForwardSessionsContext);
  if (controller === null) {
    throw new Error("usePortForwardSessionsController requires PortForwardSessionsProvider");
  }
  return controller;
}

export function useOptionalPortForwardSessionsController(): PortForwardSessionsController | null {
  return useContext(PortForwardSessionsContext);
}
