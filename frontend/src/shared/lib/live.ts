// 브라우저 스냅샷 스트림 스토어 — WS 단일 연결(D6)
import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { LiveSnapshot } from '@/shared/lib/types';

interface LiveState {
  status: 'connecting' | 'open' | 'closed';
  snapshot: LiveSnapshot | null;
  history: { at: number; clusterId: string | null; restarts: number; running: number }[];
  realtimeStats: {
    received: number;
    deltaReceived: number;
    flushes: number;
    pending: number;
    lastReceivedAt: number | null;
    lastFlushAt: number | null;
    lastFlushDelayMs: number | null;
    lastBatchSize: number;
  };
  apply: (s: LiveSnapshot) => void;
  applyCounts: (clusterId: string | null, restarts: number, running: number) => void;
  recordRealtimeReceived: (kind: 'snapshot' | 'summary' | 'delta' | 'other') => void;
  recordRealtimeFlush: (batchSize: number, oldestQueuedAt: number | null) => void;
  setStatus: (s: LiveState['status']) => void;
}
export const liveStore = create<LiveState>((set, get) => ({
  status: 'connecting',
  snapshot: null,
  history: [],
  realtimeStats: {
    received: 0,
    deltaReceived: 0,
    flushes: 0,
    pending: 0,
    lastReceivedAt: null,
    lastFlushAt: null,
    lastFlushDelayMs: null,
    lastBatchSize: 0,
  },
  apply: (snapshot) => {
    const pods = snapshot.namespaces.flatMap(n => n.pods);
    const point = { at: Date.now(), clusterId: snapshot.cluster_id ?? null, restarts: pods.reduce((a, p) => a + p.restarts, 0), running: pods.filter(p => p.phase === 'Running').length };
    set({ snapshot, history: [...get().history.slice(-899), point] });
  },
  applyCounts: (clusterId, restarts, running) => {
    const point = { at: Date.now(), clusterId, restarts, running };
    set({ history: [...get().history.slice(-899), point] });
  },
  recordRealtimeReceived: (kind) => {
    const current = get().realtimeStats;
    set({
      realtimeStats: {
        ...current,
        received: current.received + 1,
        deltaReceived: current.deltaReceived + (kind === 'delta' ? 1 : 0),
        pending: pendingDeltas.size,
        lastReceivedAt: Date.now(),
      },
    });
  },
  recordRealtimeFlush: (batchSize, oldestQueuedAt) => {
    const now = Date.now();
    const current = get().realtimeStats;
    set({
      realtimeStats: {
        ...current,
        flushes: current.flushes + 1,
        pending: pendingDeltas.size,
        lastFlushAt: now,
        lastFlushDelayMs: oldestQueuedAt === null ? null : Math.max(0, now - oldestQueuedAt),
        lastBatchSize: batchSize,
      },
    });
  },
  setStatus: (status) => set({ status }),
}));

let activeWorkspaceId: string | null = null;
let activeSocket: WebSocket | null = null;
let reconnectTimer = 0;
let connectionSeq = 0;
let queryClient: QueryClient | null = null;
let frameHandle = 0;
const pendingDeltas = new Map<string, ResourceDeltaMessage>();
const pendingDeltaQueuedAt = new Map<string, number>();

interface ResourceDeltaMessage {
  type: 'resource.delta';
  seq?: number;
  op: 'replace' | 'remove';
  key: string;
  value?: Record<string, unknown> | null;
}

export function bindLiveQueryClient(client: QueryClient | null) {
  queryClient = client;
}

export function startLive(workspaceId: string | null | undefined) {
  if (!workspaceId) {
    stopLive();
    return;
  }
  if (workspaceId === activeWorkspaceId && activeSocket && activeSocket.readyState <= WebSocket.OPEN) return;

  stopLive();
  activeWorkspaceId = workspaceId;
  connectionSeq += 1;
  const seq = connectionSeq;
  connect(workspaceId, 0, seq);
}

function stopLive() {
  connectionSeq += 1;
  activeWorkspaceId = null;
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  if (activeSocket) {
    activeSocket.onclose = null;
    activeSocket.close();
  }
  activeSocket = null;
  liveStore.getState().setStatus('closed');
}

function connect(workspaceId: string, attempt = 0, seq: number) {
  if (seq !== connectionSeq) return;
  liveStore.getState().setStatus('connecting');
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live/browser?workspace_id=${encodeURIComponent(workspaceId)}`;
  const ws = new WebSocket(url);
  activeSocket = ws;
  ws.onopen = () => liveStore.getState().setStatus('open');
  ws.onmessage = (e) => {
    if (seq !== connectionSeq) return;
    try {
      applyRealtimeMessage(JSON.parse(e.data));
    } catch { /* 스키마 미스매치 무시 */ }
  };
  ws.onclose = () => {
    if (seq !== connectionSeq) return;
    liveStore.getState().setStatus('closed');
    reconnectTimer = window.setTimeout(() => { connect(workspaceId, attempt + 1, seq); }, Math.min(15000, 1000 * 2 ** attempt) * (0.7 + Math.random() * 0.6));
  };
}

export function applyRealtimeMessage(rawMessage: unknown) {
  const message = asRecord(rawMessage);
  if (!message) return;
  if (message.type === 'snapshot') {
    liveStore.getState().recordRealtimeReceived('snapshot');
    applyRealtimeSnapshot(message);
    return;
  }
  if (message.type === 'live.summary') {
    liveStore.getState().recordRealtimeReceived('summary');
    const summary = asRecord(message.summary) ?? message;
    applyLiveSummary(summary, stringOrNull(message.cluster_id));
    return;
  }
  if (message.type === 'resource.delta') {
    const delta = asResourceDelta(message);
    if (delta) {
      liveStore.getState().recordRealtimeReceived('delta');
      enqueueResourceDelta(delta);
    }
    return;
  }
  liveStore.getState().recordRealtimeReceived('other');
  if (Array.isArray(message.namespaces)) liveStore.getState().apply(message as unknown as LiveSnapshot);
}

function applyRealtimeSnapshot(message: Record<string, unknown>) {
  const state = asRecord(message.state);
  const clusters = asRecord(state?.clusters);
  if (!clusters) return;
  for (const [clusterId, summary] of Object.entries(clusters)) {
    const summaryRecord = asRecord(summary);
    if (summaryRecord) applyLiveSummary(summaryRecord, clusterId);
  }
  const resources = asRecord(state?.resources);
  if (resources) {
    for (const [key, value] of Object.entries(resources)) {
      const record = asRecord(value);
      if (record) enqueueResourceDelta({ type: 'resource.delta', op: 'replace', key, value: record });
    }
  }
}

function applyLiveSummary(summary: Record<string, unknown>, fallbackClusterId: string | null) {
  const clusterId = stringOrNull(summary.cluster_id) ?? fallbackClusterId;
  liveStore.getState().applyCounts(
    clusterId,
    numberOrZero(summary.restart_delta),
    numberOrZero(summary.pods_ready ?? summary.pod_running ?? summary.pods_running),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrZero(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function asResourceDelta(message: Record<string, unknown>): ResourceDeltaMessage | null {
  if (typeof message.key !== 'string') return null;
  if (message.op !== 'replace' && message.op !== 'remove') return null;
  return {
    type: 'resource.delta',
    seq: typeof message.seq === 'number' ? message.seq : undefined,
    op: message.op,
    key: message.key,
    value: asRecord(message.value),
  };
}

function enqueueResourceDelta(delta: ResourceDeltaMessage) {
  pendingDeltas.set(delta.key, delta);
  pendingDeltaQueuedAt.set(delta.key, pendingDeltaQueuedAt.get(delta.key) ?? Date.now());
  liveStore.setState((state) => ({
    realtimeStats: { ...state.realtimeStats, pending: pendingDeltas.size },
  }));
  if (frameHandle) return;
  frameHandle = window.requestAnimationFrame(flushResourceDeltas);
}

function flushResourceDeltas() {
  frameHandle = 0;
  const client = queryClient;
  if (!client || pendingDeltas.size === 0) return;
  const deltas = [...pendingDeltas.values()];
  const oldestQueuedAt = Math.min(
    ...deltas.map(delta => pendingDeltaQueuedAt.get(delta.key) ?? Date.now()),
  );
  pendingDeltas.clear();
  pendingDeltaQueuedAt.clear();
  const touchedClusters = new Set<string>();
  for (const delta of deltas) {
    const [clusterId, namespace, kind, name] = delta.key.split('/', 4);
    if (!clusterId || kind !== 'pod' || !name) continue;
    touchedClusters.add(clusterId);
    patchPodInventory(client, clusterId, namespace, name, delta);
    patchNodePodSummaries(client, clusterId, namespace, name, delta);
  }
  for (const clusterId of touchedClusters) {
    client.invalidateQueries({ queryKey: ['clusters', clusterId, 'summary'], exact: true });
    client.invalidateQueries({ queryKey: ['clusters', clusterId, 'inv', 'workloads'], exact: true });
  }
  liveStore.getState().recordRealtimeFlush(deltas.length, Number.isFinite(oldestQueuedAt) ? oldestQueuedAt : null);
}

function patchPodInventory(
  client: QueryClient,
  clusterId: string,
  namespace: string,
  name: string,
  delta: ResourceDeltaMessage,
) {
  client.setQueryData<{ resources: Record<string, unknown>[] }>(
    ['clusters', clusterId, 'inv', 'pods'],
    (current) => {
      if (!current?.resources) return current;
      const resources = upsertResource(current.resources, namespace, name, delta);
      return resources === current.resources ? current : { ...current, resources };
    },
  );
}

function patchNodePodSummaries(
  client: QueryClient,
  clusterId: string,
  namespace: string,
  name: string,
  delta: ResourceDeltaMessage,
) {
  client.setQueriesData<Record<string, unknown>[]>(
    { queryKey: ['clusters', clusterId, 'nodes'] },
    (current) => {
      if (!Array.isArray(current)) return current;
      return upsertResource(current, namespace, name, delta);
    },
  );
}

function upsertResource(
  rows: Record<string, unknown>[],
  namespace: string,
  name: string,
  delta: ResourceDeltaMessage,
) {
  const index = rows.findIndex((row) => row.name === name && row.namespace === namespace);
  if (delta.op === 'remove') {
    return index >= 0 ? rows.filter((_, rowIndex) => rowIndex !== index) : rows;
  }
  const value = delta.value ?? {};
  const next = { ...value, name, namespace };
  if (index < 0) return [next, ...rows];
  return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row));
}
