// 승인 카드 — repo·workflow·chat·notifications 공유 단일 구현 (중복 금지 AC)
import { useApproval } from '@/features/repo/api';
import { useIsAdmin } from '@/features/auth/api';
import { Badge, Button } from '@/shared/ui';

export function ApprovalCard({ approvalId, summary, resolved, compact }:
  { approvalId: string; summary: string; resolved?: 'granted' | 'rejected'; compact?: boolean }) {
  const approval = useApproval();
  const canDeploy = useIsAdmin(); // mock 단계 단순화: 서버가 최종 검증(G5 도입 시 리소스 권한으로 대체)
  if (resolved) return <Badge status={resolved} />;
  return (
    <div className="card" style={{ background: 'var(--surface-2)', padding: compact ? 10 : 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <Badge tone="warn">승인 대기</Badge>
      <span style={{ fontSize: 'var(--fs-sm)', flex: 1 }}>{summary}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="primary" disabled={!canDeploy} loading={approval.isPending}
          title={canDeploy ? '' : 'deploy 권한 필요'}
          onClick={() => approval.mutate({ approvalId, action: 'grant' })}>승인</Button>
        <Button size="sm" variant="danger" disabled={!canDeploy}
          onClick={() => approval.mutate({ approvalId, action: 'reject' })}>거절</Button>
      </span>
    </div>
  );
}
