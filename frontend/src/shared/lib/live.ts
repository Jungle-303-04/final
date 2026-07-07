// 브라우저 스냅샷 스트림 스토어 — WS 단일 연결(D6)
import { create } from 'zustand';
import type { LiveSnapshot } from '@/shared/lib/types';

interface LiveState {
  status: 'connecting' | 'open' | 'closed';
  snapshot: LiveSnapshot | null;
  history: { at: number; restarts: number; running: number }[];
  apply: (s: LiveSnapshot) => void;
  applyCounts: (restarts: number, running: number) => void;
  setStatus: (s: LiveState['status']) => void;
}
export const liveStore = create<LiveState>((set, get) => ({
  status: 'connecting', snapshot: null, history: [],
  apply: (snapshot) => {
    const pods = snapshot.namespaces.flatMap(n => n.pods);
    const point = { at: Date.now(), restarts: pods.reduce((a, p) => a + p.restarts, 0), running: pods.filter(p => p.phase === 'Running').length };
    set({ snapshot, history: [...get().history.slice(-899), point] });
  },
  applyCounts: (restarts, running) => {
    const point = { at: Date.now(), restarts, running };
    set({ history: [...get().history.slice(-899), point] });
  },
  setStatus: (status) => set({ status }),
}));

let started = false;
export function startLive() {
  if (started) return; started = true;
  void connect();
  async function connect(attempt = 0) {
    const workspaceId = await currentWorkspaceId();
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live/browser?workspace_id=${encodeURIComponent(workspaceId)}`;
    const ws = new WebSocket(url);
    ws.onopen = () => liveStore.getState().setStatus('open');
    ws.onmessage = (e) => {
      try {
        const message = JSON.parse(e.data);
        if (message?.type === 'live.summary') {
          liveStore.getState().applyCounts(Number(message.summary?.restart_delta ?? 0), Number(message.summary?.pods_ready ?? 0));
          return;
        }
        if (message?.namespaces) liveStore.getState().apply(message);
      } catch { /* 스키마 미스매치 무시 */ }
    };
    ws.onclose = () => {
      liveStore.getState().setStatus('closed');
      setTimeout(() => { void connect(attempt + 1); }, Math.min(15000, 1000 * 2 ** attempt) * (0.7 + Math.random() * 0.6));
    };
  }
}

async function currentWorkspaceId(): Promise<string> {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    if (!res.ok) return 'default';
    const session = await res.json();
    return String(session.workspace_id || 'default');
  } catch {
    return 'default';
  }
}
