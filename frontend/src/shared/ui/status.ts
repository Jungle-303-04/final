// 상태 어휘 → 색 매핑 단일 출처 (docs/fd/04 § 상태 어휘)
import type { Tone } from '@/shared/lib/types';

const MAP: Record<string, Tone> = {
  SUCCEEDED: 'ok', healthy: 'ok', Running: 'ok', granted: 'ok', completed: 'ok', connected: 'ok', active: 'ok', ready: 'ok', created: 'ok', done: 'ok',
  STARTED: 'info', RENDERING: 'info', DIFFING: 'info', APPLYING: 'info', ROLLOUT_WAITING: 'info', progressing: 'info', running: 'info', leased: 'info', waiting: 'info', patch_prepared: 'info',
  POLICY_CHECKING: 'warn', WAITING_FOR_APPROVAL: 'warn', degraded: 'warn', Pending: 'warn', requested: 'warn', queued: 'warn', pending_approval: 'warn', pending_verification: 'warn', disconnected: 'warn',
  FAILED: 'danger', unhealthy: 'danger', CrashLoopBackOff: 'danger', rejected: 'danger', failed: 'danger', open: 'danger',
};
export function toneOf(status: string): Tone { return MAP[status] ?? 'neutral'; }
export function toneColor(tone: Tone): string { return `var(--${tone})`; }
