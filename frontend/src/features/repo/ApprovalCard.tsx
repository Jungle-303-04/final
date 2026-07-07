// 승인 카드 — repo·workflow·chat·notifications 공유 단일 구현 (중복 금지 AC)
import { useApproval } from '@/features/repo/api';
import { useIsAdmin } from '@/features/auth/api';
import { Badge, Button } from '@/shared/ui';
import { FadeSlideIn } from '@/shared/motion';

export function ApprovalCard({ approvalId, summary, resolved, compact }:
  { approvalId: string; summary: string; resolved?: 'granted' | 'rejected'; compact?: boolean }) {
  const approval = useApproval();
  const canDeploy = useIsAdmin(); // 프론트는 표시만 단순화 — 서버가 최종 검증(G5 도입 시 리소스 권한으로 대체)
  // 승인/거절 확정 시 배지가 부드럽게 등장 — 상태 전환이 갑작스럽지 않게
  if (resolved) return <FadeSlideIn><Badge status={resolved} /></FadeSlideIn>;
  return (
    <div className="card" style={{ background: 'var(--surface-2)', padding: compact ? 10 : 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <Badge tone="warn">승인 대기</Badge>
      <span style={{ fontSize: 'var(--fs-sm)', flex: 1 }}>{summary}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        {/* 클릭한 버튼에만 로딩 표시 — variables.action 으로 진행 중인 결정을 구분 */}
        <Button size="sm" variant="primary" disabled={!canDeploy || approval.isPending}
          loading={approval.isPending && approval.variables?.action === 'grant'}
          title={canDeploy ? '' : 'deploy 권한 필요'}
          onClick={() => approval.mutate({ approvalId, action: 'grant' })}>승인</Button>
        <Button size="sm" variant="danger" disabled={!canDeploy || approval.isPending}
          loading={approval.isPending && approval.variables?.action === 'reject'}
          title={canDeploy ? '' : 'deploy 권한 필요'}
          onClick={() => approval.mutate({ approvalId, action: 'reject' })}>거절</Button>
      </span>
    </div>
  );
}
