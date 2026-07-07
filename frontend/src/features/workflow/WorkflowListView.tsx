import { useNavigate } from 'react-router-dom';
import { useApplications, useRunsAll } from '@/features/repo/api';
import { Badge, Card, EmptyState, ResourceTable, Skeleton } from '@/shared/ui';
import { PageHeader } from '@/plural-ui';
import { shortSha, timeAgo } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import { useConsolePath } from '@/features/console/ui';

const ACTIVE = new Set(['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING']);

export default function WorkflowListView() {
  const apps = useApplications();
  const all = useRunsAll(apps.data ?? []);
  const nav = useNavigate();
  const pathFor = useConsolePath();
  const rows = all.items.flatMap(({ appId, runs }) => runs.map(r => ({ ...r, appId })))
    .sort((a, b) => Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status)) || (b.started_at ?? '').localeCompare(a.started_at ?? ''));
  const loading = apps.isPending || ((apps.data ?? []).length > 0 && all.pending);
  return (
    <FadeSlideIn>
      <PageHeader title="워크플로우" sub="커밋 → 렌더 → diff → 정책 → 승인 → 적용 파이프라인 run" />
      <Card>
        {loading ? <Skeleton lines={4} /> :
        rows.length === 0 ? <EmptyState icon="⇶" title="실행된 워크플로우가 없습니다" description="레포에 커밋이 감지되면 run 이 생성됩니다" /> :
          <ResourceTable rows={rows} rowKey={r => r.run_id} onRowClick={r => nav(pathFor(`/workflows/${r.run_id}`))}
            columns={[
              { key: 'app', label: '앱', render: r => <b>{r.appId}</b> },
              { key: 'sha', label: '커밋', render: r => <code>{shortSha(r.commit_sha)}</code> },
              { key: 'status', label: '상태', render: r => <Badge status={r.status} /> },
              { key: 'step', label: '현재 단계', render: r => r.current_step },
              { key: 'at', label: '시작', render: r => timeAgo(r.started_at) },
            ]} />}
      </Card>
    </FadeSlideIn>
  );
}
