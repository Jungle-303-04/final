import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
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
  | "cancelled"
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
  maxEmptySnapshots: number;
  maxTerminalCommands: number;
  terminalRetentionMs: number;
}

export interface OperationStatusStoreRuntime {
  cancelFrame(frame: number): void;
  clearTimer(timer: number): void;
  isVisible(): boolean;
  now(): number;
  requestFrame(callback: FrameRequestCallback): number;
  setTimer(callback: () => void, delayMs: number): number;
  subscribeVisibilityChange(listener: () => void): () => void;
}

export interface OperationStatusStore {
  dispose(): void;
  getSnapshot(commandId: string): OperationStatusSnapshot;
  getSnapshots(): readonly OperationStatusSnapshot[];
  reobserve(commandId: string): void;
  start(commandId: string): void;
  subscribe(commandId: string, listener: () => void): () => void;
  subscribeAll(listener: () => void): () => void;
}

const DEFAULT_RETENTION_POLICY: OperationStatusRetentionPolicy = {
  maxEmptySnapshots: 64,
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
  clearTimer(timer) {
    clearTimeout(timer);
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
  setTimer(callback, delayMs) {
    return setTimeout(callback, delayMs) as unknown as number;
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
  const allListeners = new Set<() => void>();
  const pendingNotifications = new Set<string>();
  let frame: number | null = null;
  let retentionTimer: number | null = null;
  let publishedSnapshots: readonly OperationStatusSnapshot[] = [];
  let snapshotsDirty = false;
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
      if (retentionTimer !== null) environment.clearTimer(retentionTimer);
      frame = null;
      retentionTimer = null;
      unsubscribeVisibility();
      entries.forEach((entry) => entry.controller?.abort());
      entries.clear();
      listeners.clear();
      allListeners.clear();
      pendingNotifications.clear();
      emptySnapshots.clear();
      publishedSnapshots = [];
      snapshotsDirty = false;
    },
    getSnapshot(commandId) {
      const normalized = commandId.trim();
      return entries.get(normalized)?.snapshot ?? emptySnapshot(normalized);
    },
    getSnapshots() {
      return publishedSnapshots;
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
      const normalized = commandId.trim();
      let commandListeners = listeners.get(normalized);
      if (!commandListeners) {
        commandListeners = new Set();
        listeners.set(normalized, commandListeners);
      }
      commandListeners.add(listener);
      return () => {
        const current = listeners.get(normalized);
        current?.delete(listener);
        if (current?.size === 0) listeners.delete(normalized);
      };
    },
    subscribeAll(listener) {
      allListeners.add(listener);
      return () => allListeners.delete(listener);
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
        if (isFinal(entry.snapshot.status)) return;
      }
      if (isCurrent(entry, generation, controller) && !isFinal(entry.snapshot.status)) {
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
    if (disposed || entry.generation !== generation || isFinal(entry.snapshot.status)) return;
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
    if (isFinal(entry.snapshot.status)) return;
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
        : event.kind === "cancelled"
          ? "cancelled"
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
    if (isFinal(entry.snapshot.status) || (
      entry.snapshot.status === failure && entry.snapshot.failure === failure
    )) return;
    update(entry, { failure, retry: null, status: failure }, true);
    entry.controller?.abort();
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
    snapshotsDirty = true;
    if (isFinal(entry.snapshot.status)) pruneTerminalEntries();
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
    if (snapshotsDirty) {
      publishedSnapshots = [...entries.values()]
        .map((entry) => entry.snapshot)
        .filter((snapshot) => snapshot.status !== "idle")
        .sort((left, right) => right.updatedAt - left.updatedAt);
      snapshotsDirty = false;
      allListeners.forEach((listener) => listener());
    }
    commandIds.forEach((commandId) => {
      listeners.get(commandId)?.forEach((listener) => listener());
    });
  }

  function pruneTerminalEntries(): void {
    const now = environment.now();
    const terminalEntries = [...entries.values()]
      .filter((entry) => isFinal(entry.snapshot.status))
      .sort((left, right) => left.snapshot.updatedAt - right.snapshot.updatedAt);
    const expired = terminalEntries.filter((entry) => (
      now - entry.snapshot.updatedAt >= retention.terminalRetentionMs
    ));
    expired.forEach(removeEntry);
    const retained = terminalEntries.filter((entry) => !expired.includes(entry));
    const overflow = Math.max(0, retained.length - retention.maxTerminalCommands);
    retained.slice(0, overflow).forEach(removeEntry);
    scheduleRetentionPrune();
  }

  function removeEntry(entry: Entry): void {
    if (!entries.delete(entry.snapshot.commandId)) return;
    pendingNotifications.add(entry.snapshot.commandId);
    snapshotsDirty = true;
  }

  function scheduleRetentionPrune(): void {
    if (retentionTimer !== null) environment.clearTimer(retentionTimer);
    retentionTimer = null;
    const terminalEntries = [...entries.values()].filter((entry) => isFinal(entry.snapshot.status));
    if (terminalEntries.length === 0 || disposed) return;
    const expiresAt = Math.min(...terminalEntries.map((entry) => (
      entry.snapshot.updatedAt + retention.terminalRetentionMs
    )));
    const delay = Math.max(0, expiresAt - environment.now());
    retentionTimer = environment.setTimer(() => {
      retentionTimer = null;
      pruneTerminalEntries();
      if (pendingNotifications.size > 0 && environment.isVisible()) flushNotifications();
    }, delay);
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
    while (emptySnapshots.size > retention.maxEmptySnapshots) {
      const oldest = emptySnapshots.keys().next().value;
      if (oldest === undefined) break;
      emptySnapshots.delete(oldest);
    }
    return snapshot;
  }

  function isCurrent(entry: Entry, generation: number, controller: AbortController): boolean {
    return !disposed && entry.generation === generation && entry.controller === controller;
  }
}

function isTerminal(status: OperationStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isFinal(status: OperationStatus): boolean {
  return isTerminal(status) || isObservationFailure(status);
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
  const [pendingDisposals] = useState(() => new Map<OperationStatusStore, number>());
  useEffect(() => {
    const pending = pendingDisposals.get(store);
    if (pending !== undefined) {
      clearTimeout(pending);
      pendingDisposals.delete(store);
    }
    return () => {
      const timer = setTimeout(() => {
        pendingDisposals.delete(store);
        store.dispose();
      }, 0) as unknown as number;
      pendingDisposals.set(store, timer);
    };
  }, [pendingDisposals, store]);
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

export function useOptionalOperationStatus(commandId: string): OperationStatusSnapshot | null {
  const store = useOptionalOperationStatusStore();
  const subscribe = useCallback((listener: () => void) => (
    store && commandId ? store.subscribe(commandId, listener) : () => undefined
  ), [commandId, store]);
  const getSnapshot = useCallback(() => (
    store && commandId ? store.getSnapshot(commandId) : null
  ), [commandId, store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useOperationStatusSnapshots(): readonly OperationStatusSnapshot[] {
  const store = useOperationStatusStore();
  const subscribe = useCallback((listener: () => void) => store.subscribeAll(listener), [store]);
  return useSyncExternalStore(subscribe, store.getSnapshots, store.getSnapshots);
}

const EMPTY_OPERATION_STATUS_SNAPSHOTS: readonly OperationStatusSnapshot[] = [];

export function useOptionalOperationStatusSnapshots(): readonly OperationStatusSnapshot[] {
  const store = useOptionalOperationStatusStore();
  const subscribe = useCallback((listener: () => void) => (
    store ? store.subscribeAll(listener) : () => undefined
  ), [store]);
  const getSnapshot = useCallback(() => (
    store?.getSnapshots() ?? EMPTY_OPERATION_STATUS_SNAPSHOTS
  ), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
