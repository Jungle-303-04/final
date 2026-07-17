import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { usePortForwardSessionsController } from "../service-access/PortForwardSessionsProvider";

export type ShellOwnedSessionKind = "exec" | "local-terminal";

export interface ShellOwnedSession {
  clusterId: string | null;
  id: string;
  kind: ShellOwnedSessionKind;
}

export interface ShellSessionCounts {
  execSessions: number;
  localTerminals: number;
  portForwards: number;
  total: number;
}

interface ShellSessionsController {
  countsForCluster(clusterId: string | null): ShellSessionCounts;
  register(session: ShellOwnedSession): () => void;
}

const ShellSessionsContext = createContext<ShellSessionsController | null>(null);

/**
 * One browser-owned registry for the session surfaces that the upstream
 * single-process `/sessions` handler counted. Port forwarding remains owned by
 * its native/Agent adapter; exec and local PTY owners register only their live
 * lifetime. No target connection or duplicate transport is introduced here.
 */
export function ShellSessionsProvider({ children }: { children: ReactNode }) {
  const portForward = usePortForwardSessionsController();
  const [registered, setRegistered] = useState<ReadonlyMap<symbol, ShellOwnedSession>>(
    () => new Map(),
  );
  const register = useCallback((session: ShellOwnedSession) => {
    const token = Symbol(`${session.kind}:${session.id}`);
    setRegistered((current) => {
      const next = new Map(current);
      next.set(token, session);
      return next;
    });
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      setRegistered((current) => {
        if (!current.has(token)) return current;
        const next = new Map(current);
        next.delete(token);
        return next;
      });
    };
  }, []);
  const activePortForwards = useMemo(() => (
    portForward.frame.phase === "ready"
      ? portForward.frame.data.sessions.filter((session) => (
          session.status === "starting" || session.status === "running"
        ))
      : []
  ), [portForward.frame]);
  const countsForCluster = useCallback((clusterId: string | null): ShellSessionCounts => {
    const portForwards = activePortForwards.filter((session) => (
      clusterId === null || session.clusterId === clusterId
    )).length;
    let execSessions = 0;
    let localTerminals = 0;
    for (const session of registered.values()) {
      if (session.kind === "local-terminal") {
        localTerminals += 1;
      } else if (clusterId === null || session.clusterId === clusterId) {
        execSessions += 1;
      }
    }
    return {
      execSessions,
      localTerminals,
      portForwards,
      total: execSessions + localTerminals + portForwards,
    };
  }, [activePortForwards, registered]);
  const value = useMemo(() => ({ countsForCluster, register }), [countsForCluster, register]);
  return (
    <ShellSessionsContext.Provider value={value}>
      {children}
    </ShellSessionsContext.Provider>
  );
}

export function useShellSessions(): ShellSessionsController {
  const sessions = useContext(ShellSessionsContext);
  if (sessions === null) {
    throw new Error("useShellSessions requires ShellSessionsProvider");
  }
  return sessions;
}

export function useOptionalShellSessions(): ShellSessionsController | null {
  return useContext(ShellSessionsContext);
}
