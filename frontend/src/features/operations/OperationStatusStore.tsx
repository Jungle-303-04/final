import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type {
  OperationEvent,
  OperationEventsPort,
  OperationStreamFailure,
  OperationStreamLifecycle,
} from "./operationEventsContract";

export type OperationStatus =
  | "idle"
  | "connecting"
  | "running"
  | "reconnecting"
  | "completed"
  | "failed"
  | OperationStreamFailure;

export interface OperationStatusSnapshot {
  commandId: string;
  event: OperationEvent | null;
  failure: OperationStreamFailure | null;
  retry: { attempt: number; retryAfterMs: number } | null;
  sequence: number | null;
  status: OperationStatus;
  updatedAt: number;
}

export interface OperationStatusRetentionPolicy {
  maxTerminalCommands: number;
  terminalRetentionMs: number;
}

export interface OperationStatusStoreRuntime {
  cancelFrame(frame: number): void;
  isVisible(): boolean;
  now(): number;
  requestFrame(callback: FrameRequestCallback): number;
  subscribeVisibilityChange(listener: () => void): () => void;
}

export interface OperationStatusStore {
  dispose(): void;
  getSnapshot(commandId: string): OperationStatusSnapshot;
  reobserve(commandId: string): void;
  start(commandId: string): void;
  subscribe(commandId: string, listener: () => void): () => void;
}

const DEFAULT_RETENTION_POLICY: OperationStatusRetentionPolicy = {
  maxTerminalCommands: 64,
  terminalRetentionMs: 30 * 60 * 1_000,
};

const browserRuntime: OperationStatusStoreRuntime = {
  cancelFrame(frame) {
    if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(frame);
      return;
    }
    clearTimeout(frame);
  },
  isVisible() {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
  },
  now: () => Date.now(),
  requestFrame(callback) {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(callback);
    }
    return setTimeout(() => callback(Date.now()), 16) as unknown as number;
  },
  subscribeVisibilityChange(listener) {
    if (typeof document === "undefined") return () => undefined;
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
};

interface Entry {
  controller: AbortController | null;
  generation: number;
  snapshot: OperationStatusSnapshot;
}

export function createOperationStatusStore(
  port: OperationEventsPort,
  policy?: Partial<OperationStatusRetentionPolicy>,
  runtime?: Partial<OperationStatusStoreRuntime>,
): OperationStatusStore {
  const retention = { ...DEFAULT_RETENTION_POLICY, ...policy };
  const environment = { ...browserRuntime, ...runtime };
  const entries = new Map<string, Entry>();
  const emptySnapshots = new Map<string, OperationStatusSnapshot>();
  const listeners = new Map<string, Set<() => void>>();
  const pendingNotifications = new Set<string>();
  let frame: number | null = null;
  let disposed = false;
  const unsubscribeVisibility = environment.subscribeVisibilityChange(() => {
    if (!environment.isVisible()) {
      if (frame !== null) environment.cancelFrame(frame);
      frame = null;
      return;
    }
    flushNotifications();
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== null) environment.cancelFrame(frame);
      frame = null;
      unsubscribeVisibility();
      entries.forEach((entry) => entry.controller?.abort());
      entries.clear();
      listeners.clear();
      pendingNotifications.clear();
      emptySnapshots.clear();
    },
    getSnapshot(commandId) {
      return entries.get(commandId)?.snapshot ?? emptySnapshot(commandId);
    },
    reobserve(commandId) {
      if (disposed) return;
      const normalized = commandId.trim();
      if (!normalized) return;
      const entry = entries.get(normalized);
      if (!entry) {
        begin(normalized);
        return;
      }
      if (!canReobserve(entry.snapshot.status)) return;
      begin(normalized);
    },
    start(commandId) {
      const normalized = commandId.trim();
      if (disposed || !normalized || entries.has(normalized)) return;
      begin(normalized);
    },
    subscribe(commandId, listener) {
      let commandListeners = listeners.get(commandId);
      if (!commandListeners) {
        commandListeners = new Set();
        listeners.set(commandId, commandListeners);
      }
      commandListeners.add(listener);
      return () => {
        const current = listeners.get(commandId);
        current?.delete(listener);
        if (current?.size === 0) listeners.delete(commandId);
      };
    },
  };

  function begin(commandId: string): void {
    const normalized = commandId.trim();
    if (!normalized) return;
    const entry = entries.get(normalized) ?? {
      controller: null,
      generation: 0,
      snapshot: emptySnapshot(normalized),
    };
    entries.set(normalized, entry);
    entry.controller?.abort();
    const controller = new AbortController();
    const generation = entry.generation + 1;
    entry.generation = generation;
    entry.controller = controller;
    update(entry, {
      failure: null,
      retry: null,
      status: "connecting",
    }, true);
    void observe(entry, controller, generation);
  }

  async function observe(entry: Entry, controller: AbortController, generation: number): Promise<void> {
    try {
      for await (const event of port.subscribeOperationEvents(entry.snapshot.commandId, {
        afterSequence: entry.snapshot.sequence ?? 0,
        onLifecycle: (lifecycle) => onLifecycle(entry, generation, lifecycle),
        signal: controller.signal,
      })) {
        if (!isCurrent(entry, generation, controller)) return;
        onEvent(entry, event);
        if (isTerminal(entry.snapshot.status)) return;
      }
      if (isCurrent(entry, generation, controller) && !isTerminal(entry.snapshot.status)) {
        fail(entry, "unavailable");
      }
    } catch (error) {
      if (isCurrent(entry, generation, controller) && !controller.signal.aborted) {
        if (!isObservationFailure(entry.snapshot.status)) {
          fail(entry, failureFromUnknown(error));
        }
      }
    } finally {
      if (isCurrent(entry, generation, controller)) entry.controller = null;
    }
  }

  function onLifecycle(entry: Entry, generation: number, lifecycle: OperationStreamLifecycle): void {
    if (disposed || entry.generation !== generation || isTerminal(entry.snapshot.status)) return;
    switch (lifecycle.state) {
      case "connecting":
        update(entry, { failure: null, retry: null, status: "connecting" }, true);
        return;
      case "connected":
        update(entry, { failure: null, retry: null, status: "running" }, true);
        return;
      case "reconnecting":
        update(entry, {
          retry: { attempt: lifecycle.attempt, retryAfterMs: lifecycle.retryAfterMs },
          status: "reconnecting",
        }, true);
        return;
      case "closed":
        fail(entry, "unavailable");
        return;
      case "failed":
        fail(entry, lifecycle.failure);
    }
  }

  function onEvent(entry: Entry, event: OperationEvent): void {
    if (isTerminal(entry.snapshot.status)) return;
    const previousSequence = entry.snapshot.sequence;
    if (
      event.commandId !== entry.snapshot.commandId
      || event.sequence < 1
      || (previousSequence === null && event.sequence !== 1)
      || (previousSequence !== null && event.sequence > previousSequence + 1)
    ) {
      fail(entry, "invalid");
      return;
    }
    if (previousSequence !== null && event.sequence <= previousSequence) return;
    const terminalStatus = event.kind === "completed"
      ? "completed"
      : event.kind === "failed"
        ? "failed"
        : "running";
    update(entry, {
      event,
      failure: null,
      retry: null,
      sequence: event.sequence,
      status: terminalStatus,
    }, terminalStatus !== "running");
  }

  function fail(entry: Entry, failure: OperationStreamFailure): void {
    if (isTerminal(entry.snapshot.status) || (
      entry.snapshot.status === failure && entry.snapshot.failure === failure
    )) return;
    update(entry, { failure, retry: null, status: failure }, true);
  }

  function update(
    entry: Entry,
    changes: Partial<Pick<OperationStatusSnapshot, "event" | "failure" | "retry" | "sequence" | "status">>,
    immediate: boolean,
  ): void {
    entry.snapshot = {
      ...entry.snapshot,
      ...changes,
      updatedAt: environment.now(),
    };
    if (isTerminal(entry.snapshot.status)) pruneTerminalEntries();
    scheduleNotification(entry.snapshot.commandId, immediate);
  }

  function scheduleNotification(commandId: string, immediate: boolean): void {
    pendingNotifications.add(commandId);
    if (!environment.isVisible()) return;
    if (immediate) {
      flushNotifications();
      return;
    }
    if (frame !== null) return;
    frame = environment.requestFrame(() => {
      frame = null;
      flushNotifications();
    });
  }

  function flushNotifications(): void {
    if (frame !== null) {
      environment.cancelFrame(frame);
      frame = null;
    }
    if (!environment.isVisible()) return;
    const commandIds = [...pendingNotifications];
    pendingNotifications.clear();
    commandIds.forEach((commandId) => {
      listeners.get(commandId)?.forEach((listener) => listener());
    });
  }

  function pruneTerminalEntries(): void {
    const now = environment.now();
    const terminalEntries = [...entries.values()]
      .filter((entry) => isTerminal(entry.snapshot.status))
      .sort((left, right) => left.snapshot.updatedAt - right.snapshot.updatedAt);
    const expired = terminalEntries.filter((entry) => (
      now - entry.snapshot.updatedAt > retention.terminalRetentionMs
    ));
    expired.forEach((entry) => entries.delete(entry.snapshot.commandId));
    const retained = terminalEntries.filter((entry) => !expired.includes(entry));
    const overflow = Math.max(0, retained.length - retention.maxTerminalCommands);
    retained.slice(0, overflow).forEach((entry) => entries.delete(entry.snapshot.commandId));
  }

  function emptySnapshot(commandId: string): OperationStatusSnapshot {
    const existing = emptySnapshots.get(commandId);
    if (existing) return existing;
    const snapshot: OperationStatusSnapshot = {
      commandId,
      event: null,
      failure: null,
      retry: null,
      sequence: null,
      status: "idle",
      updatedAt: 0,
    };
    emptySnapshots.set(commandId, snapshot);
    return snapshot;
  }

  function isCurrent(entry: Entry, generation: number, controller: AbortController): boolean {
    return !disposed && entry.generation === generation && entry.controller === controller;
  }
}

function isTerminal(status: OperationStatus): boolean {
  return status === "completed" || status === "failed";
}

function canReobserve(status: OperationStatus): boolean {
  return isObservationFailure(status);
}

function isObservationFailure(status: OperationStatus): status is OperationStreamFailure {
  return status === "forbidden" || status === "invalid" || status === "unavailable";
}

function failureFromUnknown(error: unknown): OperationStreamFailure {
  if (error instanceof TypeError) return "invalid";
  return "unavailable";
}

const OperationStatusStoreContext = createContext<OperationStatusStore | null>(null);

export function OperationStatusStoreProvider({
  children,
  store,
}: {
  children: ReactNode;
  store: OperationStatusStore;
}) {
  useEffect(() => () => store.dispose(), [store]);
  return (
    <OperationStatusStoreContext.Provider value={store}>
      {children}
    </OperationStatusStoreContext.Provider>
  );
}

export function useOperationStatusStore(): OperationStatusStore {
  const store = useContext(OperationStatusStoreContext);
  if (!store) throw new Error("OperationStatusStoreProvider is required for operation feedback.");
  return store;
}

export function useOptionalOperationStatusStore(): OperationStatusStore | null {
  return useContext(OperationStatusStoreContext);
}

export function useOperationStatus(commandId: string): OperationStatusSnapshot {
  const store = useOperationStatusStore();
  const subscribe = useCallback((listener: () => void) => store.subscribe(commandId, listener), [commandId, store]);
  const getSnapshot = useCallback(() => store.getSnapshot(commandId), [commandId, store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
