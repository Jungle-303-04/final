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
  type LogStreamEvent,
  type LogStreamPort,
  type LogStreamTarget,
} from "../log-stream/logStreamContract";
import {
  bottomDockReducer,
  INITIAL_BOTTOM_DOCK_STATE,
  MAX_DOCK_TABS,
  type BottomDockState,
} from "./bottomDockState";
import { useOptionalI18n } from "../../shared/i18n";
import { createRafStreamCoalescer } from "../../shared/streaming/rafStreamCoalescer";

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

interface QueuedDockEvent {
  id: string;
  event: LogStreamEvent;
}

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
  const eventCoalescerRef = useRef<ReturnType<typeof createRafStreamCoalescer<QueuedDockEvent>> | null>(null);
  const pendingSetupEvents = useRef<QueuedDockEvent[]>([]);
  const acceptsEvents = useRef(true);
  const { reportUnauthorized } = useAuthSessionGate();
  const i18n = useOptionalI18n();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const queueEvent = useCallback((id: string, event: LogStreamEvent) => {
    if (!acceptsEvents.current) return;
    const queued = { id, event };
    const eventCoalescer = eventCoalescerRef.current;
    if (eventCoalescer) {
      eventCoalescer.enqueue(queued);
      return;
    }
    // Child effects can open a stream before this provider's effect owns the scheduler.
    pendingSetupEvents.current.push(queued);
  }, []);

  const discardQueuedEvents = useCallback((predicate: (event: QueuedDockEvent) => boolean) => {
    const buffered = pendingSetupEvents.current;
    const retained = buffered.filter((event) => !predicate(event));
    const discardedBuffered = buffered.length - retained.length;
    pendingSetupEvents.current = retained;
    return (eventCoalescerRef.current?.discard(predicate) ?? 0) + discardedBuffered;
  }, []);

  useEffect(() => {
    const activeSubscriptions = subscriptions.current;
    const eventCoalescer = createRafStreamCoalescer<QueuedDockEvent>({
      onFlush(events) {
        dispatch({ type: "events", batches: dockEventBatches(events) });
      },
      policy: { hiddenTab: "coalesce", maxFramesPerSecond: 60 },
    });
    eventCoalescerRef.current = eventCoalescer;
    acceptsEvents.current = true;
    for (const queued of pendingSetupEvents.current) eventCoalescer.enqueue(queued);
    pendingSetupEvents.current = [];

    return () => {
      acceptsEvents.current = false;
      if (eventCoalescerRef.current === eventCoalescer) eventCoalescerRef.current = null;
      pendingSetupEvents.current = [];
      for (const subscription of activeSubscriptions.values()) subscription.close();
      activeSubscriptions.clear();
      eventCoalescer.dispose();
    };
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
        queueEvent(id, event);
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
  }, [port, queueEvent, reportUnauthorized]);

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
          discardQueuedEvents((event) => event.id === evicted.id);
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
      discardQueuedEvents((event) => event.id === id);
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
  }), [discardQueuedEvents, state, start]);

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  const connectionAnnouncement = activeTab === null
    ? ""
    : `${activeTab.target.name}: ${i18n?.t(dockStatusKey(activeTab.status)) ?? activeTab.status}`;
  return (
    <BottomDockContext.Provider value={controller}>
      <output
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        data-testid="dock-connection-announcer"
      >
        {connectionAnnouncement}
      </output>
      {children}
    </BottomDockContext.Provider>
  );
}

function dockEventBatches(events: readonly QueuedDockEvent[]): Array<{
  id: string;
  events: LogStreamEvent[];
}> {
  const byId = new Map<string, LogStreamEvent[]>();
  for (const queued of events) {
    const batch = byId.get(queued.id);
    if (batch) batch.push(queued.event);
    else byId.set(queued.id, [queued.event]);
  }
  return [...byId].map(([id, batch]) => ({ id, events: batch }));
}

export function useBottomDock(): BottomDockController {
  return useContext(BottomDockContext);
}

function dockStatusKey(status: BottomDockState["tabs"][number]["status"]) {
  const keys = {
    connecting: "shell.dock.connecting",
    streaming: "shell.dock.streaming",
    ended: "shell.dock.ended",
    failed: "shell.dock.failed",
  } as const;
  return keys[status];
}
