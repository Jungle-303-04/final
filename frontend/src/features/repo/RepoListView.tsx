import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApplications } from '@/features/repo/api';
import { ConnectRepoWizard } from '@/features/resources/ConnectRepoWizard';
import { Badge, Button, Card, EmptyState, QueryBoundary, ResourceTable } from '@/shared/ui';
import { PageHeader } from '@/plural-ui';
import { IconFile, IconPlus } from '@/shared/ui/icons';
import { timeAgo } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import type { Application } from '@/shared/lib/types';
import { useConsolePath } from '@/features/console/ui';

export default function RepoListView() {
  const q = useApplications();
  const nav = useNavigate();
  const pathFor = useConsolePath();
  const [wizard, setWizard] = useState(false);
  return (
    <FadeSlideIn>
      <PageHeader title="레포 (GitOps)"
        actions={<Button variant="primary" onClick={() => setWizard(true)}><IconPlus size={15} />레포 연결</Button>} />
      <Card>
        <QueryBoundary query={q}>{apps => (
          <ResourceTable<Application>
            rows={apps} rowKey={a => a.application_id}
            onRowClick={a => nav(pathFor(`/repos/${a.application_id}`))}
            empty={<EmptyState icon={<IconFile size={26} />} title="연결된 레포가 없습니다" action={<Button variant="primary" onClick={() => setWizard(true)}>레포 연결</Button>} />}
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
