// 브라우저 스냅샷 스트림 스토어 — WS 단일 연결(D6)
import { create } from 'zustand';
import type { LiveSnapshot } from '@/shared/lib/types';

interface LiveState {
  status: 'connecting' | 'open' | 'closed';
  snapshot: LiveSnapshot | null;
  history: { at: number; clusterId: string | null; restarts: number; running: number }[];
  apply: (s: LiveSnapshot) => void;
  applyCounts: (clusterId: string | null, restarts: number, running: number) => void;
  setStatus: (s: LiveState['status']) => void;
}
export const liveStore = create<LiveState>((set, get) => ({
  status: 'connecting', snapshot: null, history: [],
  apply: (snapshot) => {
    const pods = snapshot.namespaces.flatMap(n => n.pods);
    const point = { at: Date.now(), clusterId: snapshot.cluster_id ?? null, restarts: pods.reduce((a, p) => a + p.restarts, 0), running: pods.filter(p => p.phase === 'Running').length };
    set({ snapshot, history: [...get().history.slice(-899), point] });
  },
  applyCounts: (clusterId, restarts, running) => {
    const point = { at: Date.now(), clusterId, restarts, running };
    set({ history: [...get().history.slice(-899), point] });
  },
  setStatus: (status) => set({ status }),
}));

let activeWorkspaceId: string | null = null;
let activeSocket: WebSocket | null = null;
let reconnectTimer = 0;
let connectionSeq = 0;

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
    applyRealtimeSnapshot(message);
    return;
  }
  if (message.type === 'live.summary') {
    const summary = asRecord(message.summary) ?? message;
    applyLiveSummary(summary, stringOrNull(message.cluster_id));
    return;
  }
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
