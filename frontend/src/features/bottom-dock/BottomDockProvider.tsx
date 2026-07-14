import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { useAuthSessionGate } from "../auth/AuthSessionGate";
import {
  EMPTY_LOG_STREAM_PORT,
  logStreamTargetKey,
  type LogStreamPort,
  type LogStreamTarget,
} from "../log-stream/logStreamContract";
import {
  bottomDockReducer,
  INITIAL_BOTTOM_DOCK_STATE,
  MAX_DOCK_TABS,
  type BottomDockState,
} from "./bottomDockState";

export interface BottomDockController extends BottomDockState {
  openLogs: (target: LogStreamTarget) => void;
  closeTab: (id: string) => void;
  selectTab: (id: string) => void;
  retryTab: (id: string) => void;
  setCollapsed: (collapsed: boolean) => void;
  setHeight: (height: number) => void;
  activeStreamId: string | null;
}

const EMPTY_CONTROLLER: BottomDockController = {
  ...INITIAL_BOTTOM_DOCK_STATE,
  openLogs: () => undefined,
  closeTab: () => undefined,
  selectTab: () => undefined,
  retryTab: () => undefined,
  setCollapsed: () => undefined,
  setHeight: () => undefined,
  activeStreamId: null,
};

const BottomDockContext = createContext<BottomDockController>(EMPTY_CONTROLLER);

export function BottomDockProvider({
  children,
  port = EMPTY_LOG_STREAM_PORT,
}: {
  children: ReactNode;
  port?: LogStreamPort;
}) {
  const [state, dispatch] = useReducer(bottomDockReducer, INITIAL_BOTTOM_DOCK_STATE);
  const stateRef = useRef(state);
  const subscriptions = useRef(new Map<string, { close: () => void; generation: number }>());
  const generation = useRef(0);
  const { reportUnauthorized } = useAuthSessionGate();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => () => {
    for (const subscription of subscriptions.current.values()) subscription.close();
    subscriptions.current.clear();
  }, []);

  const start = useCallback((id: string, target: LogStreamTarget) => {
    subscriptions.current.get(id)?.close();
    const currentGeneration = ++generation.current;
    let transportClose: () => void = () => undefined;
    subscriptions.current.set(id, {
      generation: currentGeneration,
      close: () => transportClose(),
    });
    const isCurrent = () => subscriptions.current.get(id)?.generation === currentGeneration;
    const finish = () => {
      if (!isCurrent()) return;
      subscriptions.current.delete(id);
      transportClose();
    };
    const close = port.open(target, {
      onEvent: (event) => {
        if (!isCurrent()) return;
        dispatch({ type: "event", id, event });
        if (event.type === "end" || event.type === "error") finish();
      },
      onFailure: (failure) => {
        if (!isCurrent()) return;
        if (failure.code === "unauthorized") reportUnauthorized();
        dispatch({ type: "failure", id, code: failure.code });
        finish();
      },
    });
    transportClose = close;
    if (!isCurrent()) close();
  }, [port, reportUnauthorized]);

  const controller = useMemo<BottomDockController>(() => ({
    ...state,
    activeStreamId: state.tabs.find((tab) => tab.id === state.activeTabId)?.streamId ?? null,
    openLogs(target) {
      const id = logStreamTargetKey(target);
      const existing = stateRef.current.tabs.find((tab) => tab.id === id);
      if (!existing && stateRef.current.tabs.length >= MAX_DOCK_TABS) {
        const evicted = stateRef.current.tabs[0];
        if (evicted) {
          subscriptions.current.get(evicted.id)?.close();
          subscriptions.current.delete(evicted.id);
        }
      }
      dispatch({ type: "open", id, target });
      if (!subscriptions.current.has(id)) {
        if (existing) dispatch({ type: "retry", id });
        start(id, target);
      }
    },
    closeTab(id) {
      subscriptions.current.get(id)?.close();
      subscriptions.current.delete(id);
      dispatch({ type: "close", id });
    },
    selectTab: (id) => dispatch({ type: "select", id }),
    retryTab(id) {
      const tab = stateRef.current.tabs.find((candidate) => candidate.id === id);
      if (!tab) return;
      dispatch({ type: "retry", id });
      start(id, tab.target);
    },
    setCollapsed: (collapsed) => dispatch({ type: "collapse", collapsed }),
    setHeight: (height) => dispatch({ type: "resize", height }),
  }), [state, start]);

  return <BottomDockContext.Provider value={controller}>{children}</BottomDockContext.Provider>;
}

export function useBottomDock(): BottomDockController {
  return useContext(BottomDockContext);
}
