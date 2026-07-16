import type {
  LogStreamEvent,
  LogStreamFailureCode,
  LogStreamDiagnostic,
  LogStreamTarget,
} from "../log-stream/logStreamContract";

export const MAX_DOCK_LINES = 2_000;
export const MAX_DOCK_TABS = 8;
const MAX_RECENT_LINE_IDS = MAX_DOCK_LINES;
export const MIN_DOCK_HEIGHT = 160;
export const MAX_DOCK_HEIGHT = 520;
export const DEFAULT_DOCK_HEIGHT = 280;

export interface BottomDockLine {
  id: string;
  observedAt: string;
  pod: string;
  container: string;
  line: string;
  lineTruncated: boolean;
}

export interface BottomDockTab {
  id: string;
  target: LogStreamTarget;
  status: "connecting" | "streaming" | "ended" | "failed";
  streamId: string | null;
  lines: BottomDockLine[];
  recentLineIds: string[];
  received: number;
  dropped: number;
  unseen: number;
  pods: string[];
  endReason: string | null;
  diagnostic: LogStreamDiagnostic | null;
  failureCode: LogStreamFailureCode | string | null;
  retryable: boolean;
}

export interface BottomDockState {
  tabs: BottomDockTab[];
  activeTabId: string | null;
  collapsed: boolean;
  height: number;
}

export type BottomDockAction =
  | { type: "open"; id: string; target: LogStreamTarget }
  | { type: "close"; id: string }
  | { type: "select"; id: string }
  | { type: "event"; id: string; event: LogStreamEvent }
  | { type: "events"; batches: Array<{ id: string; events: LogStreamEvent[] }> }
  | { type: "failure"; id: string; code: LogStreamFailureCode }
  | { type: "retry"; id: string }
  | { type: "collapse"; collapsed: boolean }
  | { type: "resize"; height: number };

export const INITIAL_BOTTOM_DOCK_STATE: BottomDockState = {
  tabs: [],
  activeTabId: null,
  collapsed: false,
  height: DEFAULT_DOCK_HEIGHT,
};

export function bottomDockReducer(
  state: BottomDockState,
  action: BottomDockAction,
): BottomDockState {
  if (action.type === "open") {
    const exists = state.tabs.some((tab) => tab.id === action.id);
    const tabs = exists
      ? markSeen(state.tabs, action.id)
      : [...state.tabs.slice(-(MAX_DOCK_TABS - 1)), newTab(action.id, action.target)];
    return {
      ...state,
      activeTabId: action.id,
      collapsed: false,
      tabs,
    };
  }
  if (action.type === "close") return closeTab(state, action.id);
  if (action.type === "select") {
    if (!state.tabs.some((tab) => tab.id === action.id)) return state;
    return { ...state, activeTabId: action.id, tabs: markSeen(state.tabs, action.id) };
  }
  if (action.type === "collapse") return { ...state, collapsed: action.collapsed };
  if (action.type === "resize") return { ...state, height: clampHeight(action.height) };
  if (action.type === "retry") {
    return {
      ...state,
      collapsed: false,
      tabs: state.tabs.map((tab) => tab.id === action.id ? {
        ...tab,
        status: "connecting",
        streamId: null,
        endReason: null,
        diagnostic: null,
        failureCode: null,
        retryable: false,
      } : tab),
    };
  }
  if (action.type === "events") {
    if (action.batches.length === 0) return state;
    const batches = new Map(action.batches.map((batch) => [batch.id, batch.events]));
    return {
      ...state,
      tabs: state.tabs.map((tab) => {
        const events = batches.get(tab.id);
        if (!events?.length) return tab;
        return applyEvents(tab, events, state.activeTabId === tab.id);
      }),
    };
  }
  return {
    ...state,
    tabs: state.tabs.map((tab) => tab.id === action.id
      ? action.type === "event"
        ? applyEvents(tab, [action.event], state.activeTabId === action.id)
        : {
            ...tab,
            status: "failed",
            failureCode: action.code,
            retryable: isRetryableFailure(action.code),
          }
      : tab),
  };
}

function applyEvents(
  tab: BottomDockTab,
  events: readonly LogStreamEvent[],
  active: boolean,
): BottomDockTab {
  if (events.length === 0) return tab;

  const knownLineIds = new Set(tab.recentLineIds);
  const appendedLines: BottomDockLine[] = [];
  let pods: Set<string> | null = null;
  let status = tab.status;
  let streamId = tab.streamId;
  let endReason = tab.endReason;
  let diagnostic = tab.diagnostic;
  let failureCode = tab.failureCode;
  let retryable = tab.retryable;
  let metadataChanged = false;

  for (const event of events) {
    if (event.type === "log") {
      if (knownLineIds.has(event.id)) continue;
      knownLineIds.add(event.id);
      appendedLines.push({
        id: event.id,
        observedAt: event.observedAt,
        pod: event.pod,
        container: event.container,
        line: event.line,
        lineTruncated: event.lineTruncated,
      });
      continue;
    }
    metadataChanged = true;
    if (event.type === "connected") {
      status = "streaming";
      streamId = event.streamId;
    } else if (event.type === "pod-added" || event.type === "pod-removed") {
      pods ??= new Set(tab.pods);
      if (event.type === "pod-added") pods.add(event.pod);
      else pods.delete(event.pod);
    } else if (event.type === "end") {
      status = "ended";
      endReason = event.reason;
      diagnostic = event.diagnostic;
      retryable = false;
    } else {
      status = "failed";
      failureCode = event.code;
      retryable = event.retryable;
    }
  }

  if (appendedLines.length === 0 && !metadataChanged) return tab;

  const combinedLineCount = tab.lines.length + appendedLines.length;
  const overflow = Math.max(0, combinedLineCount - MAX_DOCK_LINES);
  const lines = appendedLines.length >= MAX_DOCK_LINES
    ? appendedLines.slice(-MAX_DOCK_LINES)
    : [...tab.lines.slice(Math.min(overflow, tab.lines.length)), ...appendedLines];
  const appendedIds = appendedLines.map((line) => line.id);
  const recentLineIds = appendedIds.length >= MAX_RECENT_LINE_IDS
    ? appendedIds.slice(-MAX_RECENT_LINE_IDS)
    : [
        ...tab.recentLineIds.slice(Math.max(
          0,
          tab.recentLineIds.length + appendedIds.length - MAX_RECENT_LINE_IDS,
        )),
        ...appendedIds,
      ];

  return {
    ...tab,
    status,
    streamId,
    lines,
    recentLineIds,
    received: tab.received + appendedLines.length,
    dropped: tab.dropped + overflow,
    unseen: appendedLines.length === 0 ? tab.unseen : active ? 0 : tab.unseen + appendedLines.length,
    pods: pods === null ? tab.pods : [...pods].sort(),
    endReason,
    diagnostic,
    failureCode,
    retryable,
  };
}

function newTab(id: string, target: LogStreamTarget): BottomDockTab {
  return {
    id,
    target,
    status: "connecting",
    streamId: null,
    lines: [],
    recentLineIds: [],
    received: 0,
    dropped: 0,
    unseen: 0,
    pods: [],
    endReason: null,
    diagnostic: null,
    failureCode: null,
    retryable: false,
  };
}

function closeTab(state: BottomDockState, id: string): BottomDockState {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  const nextActive = state.activeTabId === id
    ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null
    : state.activeTabId;
  return { ...state, tabs, activeTabId: nextActive };
}

function markSeen(tabs: BottomDockTab[], id: string): BottomDockTab[] {
  return tabs.map((tab) => tab.id === id ? { ...tab, unseen: 0 } : tab);
}

export function clampHeight(value: number): number {
  const stepped = Math.round(value / 20) * 20;
  return Math.min(MAX_DOCK_HEIGHT, Math.max(MIN_DOCK_HEIGHT, stepped));
}

function isRetryableFailure(code: LogStreamFailureCode): boolean {
  return code === "offline" || code === "rate-limited" ||
    code === "unavailable" || code === "error";
}
