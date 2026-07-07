import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClusters } from '@/features/cluster/api';
import { useIsAdmin } from '@/features/auth/api';
import { RegisterClusterWizard } from '@/features/resources/RegisterClusterWizard';
import { Badge, Button, Card, EmptyState, QueryBoundary, ResourceTable, SearchInput, useSearchFilter } from '@/shared/ui';
import { PageHeader } from '@/plural-ui';
import { GlobeIcon } from '@/plural-ui/icons';
import { IconPlus } from '@/shared/ui/icons';
import { timeAgo } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import type { Cluster } from '@/shared/lib/types';

export default function ClusterListView() {
  const q = useClusters();
  const nav = useNavigate();
  const admin = useIsAdmin();
  const [wizard, setWizard] = useState(false);
  const [rows, search, setSearch] = useSearchFilter(q.data ?? [], c => `${c.name} ${c.cluster_id} ${c.environment}`);

  return (
    <FadeSlideIn>
      <PageHeader title="클러스터" sub="에이전트가 연결된 클러스터의 실측 인벤토리"
        actions={admin ? <Button variant="primary" onClick={() => setWizard(true)}><IconPlus size={15} />클러스터 등록</Button> : undefined} />
      <div style={{ marginBottom: 12 }}><SearchInput value={search} onChange={setSearch} /></div>
      <Card>
        <QueryBoundary query={q}>{() => (
          <ResourceTable<Cluster>
            rows={rows} rowKey={c => c.cluster_id}
            onRowClick={c => nav(`/clusters/${c.cluster_id}`)}
            empty={search
              ? <EmptyState icon={<GlobeIcon size={26} />} title={`'${search}' 검색 결과가 없습니다`} description="이름·환경·cluster_id 로 검색합니다" />
              : <EmptyState icon={<GlobeIcon size={26} />} title="등록된 클러스터가 없습니다"
                  description={admin ? '클러스터를 등록하고 에이전트가 연결되면 실측 인벤토리가 표시됩니다' : '접근 권한이 있는 클러스터가 연결되면 실측 인벤토리가 표시됩니다'}
                  action={admin ? <Button variant="primary" onClick={() => setWizard(true)}>첫 클러스터 등록</Button> : undefined} />}
            columns={[
              { key: 'name', label: '이름', render: c => <b>{c.name}</b> },
              { key: 'env', label: '환경', render: c => <Badge tone="neutral">{c.environment}</Badge> },
              { key: 'conn', label: '연결', render: c => <Badge status={c.connection_status} /> },
              { key: 'nodes', label: '노드', render: c => c.node_count },
              { key: 'pods', label: '팟', render: c => c.pod_count },
              { key: 'inc', label: '인시던트', render: c => c.incident_count ? <Badge tone="danger">{c.incident_count}</Badge> : '—' },
              { key: 'at', label: '등록', render: c => timeAgo(c.registered_at) },
            ]}
          />
        )}</QueryBoundary>
      </Card>
      <RegisterClusterWizard open={wizard} onClose={() => setWizard(false)} />
    </FadeSlideIn>
  );
}
