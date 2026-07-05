// 실시간 스냅샷 스토어 — WS 단일 연결(D6). mock 모드에선 가짜 스트림 생성
import { create } from 'zustand';
import type { LiveSnapshot } from '@/shared/lib/types';
import { API_MODE } from '@/shared/lib/api';
import { workloadsByCluster } from '@/shared/lib/mock/fixtures';

interface LiveState {
  status: 'connecting' | 'open' | 'closed';
  snapshot: LiveSnapshot | null;
  history: { at: number; restarts: number; running: number }[];
  apply: (s: LiveSnapshot) => void;
  setStatus: (s: LiveState['status']) => void;
}
export const liveStore = create<LiveState>((set, get) => ({
  status: 'connecting', snapshot: null, history: [],
  apply: (snapshot) => {
    const pods = snapshot.namespaces.flatMap(n => n.pods);
    const point = { at: Date.now(), restarts: pods.reduce((a, p) => a + p.restarts, 0), running: pods.filter(p => p.phase === 'Running').length };
    set({ snapshot, history: [...get().history.slice(-899), point] });
  },
  setStatus: (status) => set({ status }),
}));

let started = false;
export function startLive() {
  if (started) return; started = true;
  if (API_MODE === 'mock') {
    liveStore.getState().setStatus('open');
    let tick = 0;
    setInterval(() => {
      tick += 1;
      const pods = (workloadsByCluster['target'] ?? []).map(p => ({
        name: p.name, phase: p.phase, hot: p.hot ?? false,
        restarts: p.restarts + (p.hot ? Math.floor(tick / 5) : 0),
      }));
      liveStore.getState().apply({
        at: new Date().toISOString(), connected: true,
        namespaces: [{ namespace: 'sandbox', pods }],
        rollout: tick % 40 < 20 ? { name: 'checkout-api', progress: Math.min(100, (tick % 20) * 10) } : undefined,
      });
    }, 1000);
    return;
  }
  connect();
  function connect(attempt = 0) {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live/browser`;
    const ws = new WebSocket(url);
    ws.onopen = () => liveStore.getState().setStatus('open');
    ws.onmessage = (e) => { try { liveStore.getState().apply(JSON.parse(e.data)); } catch { /* 스키마 미스매치 무시 */ } };
    ws.onclose = () => {
      liveStore.getState().setStatus('closed');
      setTimeout(() => connect(attempt + 1), Math.min(15000, 1000 * 2 ** attempt) * (0.7 + Math.random() * 0.6));
    };
  }
}
