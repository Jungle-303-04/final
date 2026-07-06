// terraform plan 스타일 디프 미리보기 — 승인 전에 "정확히 뭐가 바뀌는지"를 필드 단위로 보여준다.
// 데이터는 diff-worker 의 3-way 비교 산출물(RunStep.changes) 그대로 — 프론트 합성 금지.
import type { PlanChange } from '@/shared/lib/types';

const CLASS_STYLE: Record<string, { symbol: string; color: string; label: string }> = {
  adoption_required: { symbol: '+', color: 'var(--ok)', label: '신규 관리' },
  intended_change: { symbol: '~', color: 'var(--info)', label: '의도된 변경' },
  drift: { symbol: '!', color: 'var(--warn)', label: '드리프트 복구' },
  conflict_or_manual_change: { symbol: '⚠', color: 'var(--danger)', label: '수동 변경 충돌' },
  already_converged: { symbol: '=', color: 'var(--text-3)', label: '이미 일치' },
};
const FALLBACK_STYLE = { symbol: '~', color: 'var(--text-2)', label: '변경' };

function short(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (value === '__missing__') return '(없음)';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export function PlanDiff({ changes, resource }: { changes: PlanChange[]; resource?: string }) {
  const actionable = changes.filter(c => c.classification !== 'already_converged');
  const converged = changes.length - actionable.length;
  if (changes.length === 0) return <p style={{ color: 'var(--text-3)', fontSize: 'var(--fs-sm)' }}>변경 없음</p>;
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }} data-testid="plan-diff">
      {resource && <div style={{ color: 'var(--text-2)', marginBottom: 6 }}>{resource}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {actionable.map(c => {
          const s = CLASS_STYLE[c.classification] ?? FALLBACK_STYLE;
          return (
            <div key={c.field_path} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ color: s.color, width: 12, textAlign: 'center', fontWeight: 700 }}>{s.symbol}</span>
              <span style={{ minWidth: 90 }}>{c.field_path}</span>
              <span style={{ color: 'var(--text-3)' }}>{short(c.before)}</span>
              <span style={{ color: 'var(--text-3)' }}>→</span>
              <span style={{ color: s.color }}>{short(c.after)}</span>
              <span style={{ color: 'var(--text-3)', marginLeft: 'auto' }}>{s.label}</span>
            </div>
          );
        })}
      </div>
      {converged > 0 && (
        <div style={{ color: 'var(--text-3)', marginTop: 6 }}>= 이미 일치 {converged}건 (적용 대상 아님)</div>
      )}
    </div>
  );
}
