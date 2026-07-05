import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClusters } from '@/features/cluster/api';
import { RegisterClusterWizard } from '@/features/resources/RegisterClusterWizard';
import { Badge, Button, Card, QueryBoundary, ResourceTable, SearchInput, useSearchFilter } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import type { Cluster } from '@/shared/lib/types';

export default function ClusterListView() {
  const q = useClusters();
  const nav = useNavigate();
  const [wizard, setWizard] = useState(false);
  const [rows, search, setSearch] = useSearchFilter(q.data ?? [], c => `${c.name} ${c.cluster_id} ${c.environment}`);

  return (
    <FadeSlideIn>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>클러스터</h1>
        <Button variant="primary" onClick={() => setWizard(true)}>+ 클러스터 등록</Button>
      </div>
      <div style={{ marginBottom: 12 }}><SearchInput value={search} onChange={setSearch} /></div>
      <Card>
        <QueryBoundary query={q}>{() => (
          <ResourceTable<Cluster>
            rows={rows} rowKey={c => c.cluster_id}
            onRowClick={c => nav(`/clusters/${c.cluster_id}`)}
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
