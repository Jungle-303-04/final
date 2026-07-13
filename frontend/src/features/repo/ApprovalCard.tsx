// 승인 카드 — repo·workflow·chat·notifications 공유 단일 구현 (중복 금지 AC)
import { useApproval } from '@/features/repo/api';
import { useSession } from '@/features/auth/api';
import { Badge, Button, Tooltip, cx } from '@/ui';
import { motion } from 'motion/react';
import { fadeInUp } from '@/ui/motion';

export function ApprovalCard({ approvalId, summary, resolved, compact }:
  { approvalId: string; summary: string; resolved?: 'granted' | 'rejected'; compact?: boolean }) {
  const approval = useApproval();
  const { data: session } = useSession();
  const canDeploy = Boolean(session?.roles?.some((role) => role === 'service_admin' || role === 'release_operator'));
  if (resolved) {
    return (
      <motion.div variants={fadeInUp} initial="initial" animate="animate">
        <Badge tone={resolved === 'granted' ? 'success' : 'danger'}>{resolved === 'granted' ? '승인 완료' : '거절 완료'}</Badge>
      </motion.div>
    );
  }
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      className={cx('flex min-w-0 flex-wrap items-center gap-3 rounded-panel border border-border bg-bg', compact ? 'p-3' : 'p-4')}
    >
      <Badge tone="warning">승인 대기</Badge>
      <span className="min-w-0 flex-1 text-body text-text-secondary">{summary}</span>
      <span className="inline-flex flex-wrap gap-2">
        <Tooltip label={canDeploy ? '배포를 승인합니다' : 'release_operator 권한 필요'}>
          <span>
            <Button
              size="sm"
              variant="primary"
              disabled={!canDeploy || approval.isPending}
              loading={approval.isPending && approval.variables?.action === 'grant'}
              onClick={() => approval.mutate({ approvalId, action: 'grant' })}
            >
              승인
            </Button>
          </span>
        </Tooltip>
        <Tooltip label={canDeploy ? '배포를 거절합니다' : 'release_operator 권한 필요'}>
          <span>
            <Button
              size="sm"
              variant="danger"
              disabled={!canDeploy || approval.isPending}
              loading={approval.isPending && approval.variables?.action === 'reject'}
              onClick={() => approval.mutate({ approvalId, action: 'reject' })}
            >
              거절
            </Button>
          </span>
        </Tooltip>
      </span>
    </motion.div>
  );
}
