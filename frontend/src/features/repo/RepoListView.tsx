import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApplications } from '@/features/repo/api';
import { ConnectRepoWizard } from '@/features/resources/ConnectRepoWizard';
import { Badge, Button, Card, EmptyState, QueryBoundary, ResourceTable } from '@/shared/ui';
import { PageHeader } from '@/plural-ui';
import { IconPlus } from '@/shared/ui/icons';
import { timeAgo } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import type { Application } from '@/shared/lib/types';

export default function RepoListView() {
  const q = useApplications();
  const nav = useNavigate();
  const [wizard, setWizard] = useState(false);
  return (
    <FadeSlideIn>
      <PageHeader title="레포 (GitOps)" sub="Git 이 원본 — 커밋이 감지되면 워크플로우 run 이 생성됩니다"
        actions={<Button variant="primary" onClick={() => setWizard(true)}><IconPlus size={15} />레포 연결</Button>} />
      <Card>
        <QueryBoundary query={q}>{apps => (
          <ResourceTable<Application>
            rows={apps} rowKey={a => a.application_id}
            onRowClick={a => nav(`/repos/${a.application_id}`)}
            empty={<EmptyState icon="⑂" title="연결된 레포가 없습니다" action={<Button variant="primary" onClick={() => setWizard(true)}>레포 연결</Button>} />}
            columns={[
              { key: 'name', label: '앱', render: a => <b>{a.name}</b> },
              { key: 'repo', label: '레포', render: a => <code>{a.repo_ref}@{a.branch}</code> },
              { key: 'cluster', label: '클러스터', render: a => a.cluster_id },
              { key: 'status', label: '최근 run', render: a => a.last_run_status ? <Badge status={a.last_run_status} /> : '—' },
              { key: 'at', label: '마지막 배포', render: a => a.last_deployed_at ? timeAgo(a.last_deployed_at) : '—' },
            ]}
          />
        )}</QueryBoundary>
      </Card>
      <ConnectRepoWizard open={wizard} onClose={() => setWizard(false)} />
    </FadeSlideIn>
  );
}
