// Stacks + Kubernetes 그룹
import { useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconFrame,
  LinkTabList,
  PageHeader,
  SearchInput,
  SideNav,
  Table,
} from '@/plural-ui';
import { CaretRightIcon, PackageIcon, PlusIcon } from '@/plural-ui/icons';
import { CLUSTERS, getK8sResources, STACK_ENV, STACK_FILES, STACK_RUNS, STACKS, type K8sResource } from '../api';
import { statusSeverity } from '../ui';
import { CreateStackWizard, TriggerRunModal } from '../flows';
import { K8sResourceModal, PermissionsModal } from '../popups';

/* ═══ Stacks ═══════════════════════════ */
export function StacksList() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const rows = STACKS.filter((s) => s.name.includes(q));

  return (
    <>
      <PageHeader title="스택" sub="Infrastructure-as-Code 실행을 관리합니다." />
      <div className="pl-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="스택 검색" />
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <PlusIcon size={14} /> 스택 생성
        </Button>
      </div>
      <CreateStackWizard open={createOpen} onClose={() => setCreateOpen(false)} />
      <Table headers={['스택', '유형', '저장소', '상태', '업데이트', '']}>
        {rows.map((s) => (
          <tr key={s.id}>
            <td>
              <div className="pl-cell">
                <IconFrame size="md">
                  <PackageIcon />
                </IconFrame>
                {s.name}
              </div>
            </td>
            <td>
              <Chip>{s.type}</Chip>
            </td>
            <td>
              <span className="pl-code">{s.repo}</span>
            </td>
            <td>
              <Chip severity={statusSeverity(s.status)}>{s.status}</Chip>
            </td>
            <td>{s.updatedAt}</td>
            <td>
              <div className="pl-rowactions">
                <button
                  type="button"
                  className="pl-caretbtn"
                  onClick={() => navigate(`/console/stacks/${s.id}/runs`)}
                  aria-label="상세"
                >
                  <CaretRightIcon size={14} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

export function StackDetail() {
  const { stackId } = useParams();
  const s = STACKS.find((x) => x.id === stackId) ?? STACKS[0];
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);

  return (
    <>
      <PageHeader
        title={s.name}
        sub={`${s.type} · ${s.repo}`}
        actions={
          <>
            <Button onClick={() => setPermsOpen(true)}>권한</Button>
            <Button variant="primary" onClick={() => setTriggerOpen(true)}>
              실행 트리거
            </Button>
          </>
        }
      />
      {permsOpen && <PermissionsModal resource={`스택 ${s.name}`} onClose={() => setPermsOpen(false)} />}
      <TriggerRunModal open={triggerOpen} onClose={() => setTriggerOpen(false)} />
      <LinkTabList
        tabs={[
          { to: `/console/stacks/${stackId}/runs`, label: '실행' },
          { to: `/console/stacks/${stackId}/state`, label: '상태' },
          { to: `/console/stacks/${stackId}/output`, label: '출력' },
          { to: `/console/stacks/${stackId}/vars`, label: '변수' },
          { to: `/console/stacks/${stackId}/env`, label: '환경' },
          { to: `/console/stacks/${stackId}/files`, label: '파일' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function StackRuns() {
  const { stackId } = useParams();
  const navigate = useNavigate();
  return (
    <Table headers={['실행', '상태', '트리거', '플랜', '시작', '소요', '']}>
      {STACK_RUNS.map((r) => (
        <tr key={r.id}>
          <td style={{ fontWeight: 600 }}>{r.id}</td>
          <td>
            <Chip severity={statusSeverity(r.status)}>{r.status}</Chip>
          </td>
          <td>
            <Chip>{r.trigger}</Chip>
          </td>
          <td>
            <span className="pl-code">{r.plan}</span>
          </td>
          <td>{r.startedAt}</td>
          <td>{r.duration}</td>
          <td>
            <div className="pl-rowactions">
              <button
                type="button"
                className="pl-caretbtn"
                onClick={() => navigate(`/console/stacks/${stackId}/runs/${r.id}`)}
                aria-label="상세"
              >
                <CaretRightIcon size={14} />
              </button>
            </div>
          </td>
        </tr>
      ))}
    </Table>
  );
}

export function StackState() {
  return (
    <div className="pl-codeblock">
      # terraform state list{'\n'}aws_vpc.main{'\n'}aws_subnet.private[0]{'\n'}aws_subnet.private[1]{'\n'}aws_eks_cluster.this{'\n'}aws_eks_node_group.default
    </div>
  );
}

export function StackOutput() {
  return (
    <Table headers={['키', '값', '민감']}>
      {[
        { k: 'cluster_endpoint', v: 'https://ABC123.gr7.us-east-1.eks.amazonaws.com', secret: false },
        { k: 'cluster_ca', v: '••••••••', secret: true },
      ].map((o) => (
        <tr key={o.k}>
          <td>
            <span className="pl-code">{o.k}</span>
          </td>
          <td>
            <span className="pl-code">{o.v}</span>
          </td>
          <td>{o.secret ? <Chip severity="warning">민감</Chip> : '—'}</td>
        </tr>
      ))}
    </Table>
  );
}

export function StackVars() {
  return (
    <Table headers={['변수', '값']}>
      {[
        { k: 'region', v: 'us-east-1' },
        { k: 'node_count', v: '3' },
      ].map((o) => (
        <tr key={o.k}>
          <td>
            <span className="pl-code">{o.k}</span>
          </td>
          <td>
            <span className="pl-code">{o.v}</span>
          </td>
        </tr>
      ))}
    </Table>
  );
}

export function StackEnv() {
  return (
    <Table headers={['환경 변수', '값', '민감']}>
      {STACK_ENV.map((e) => (
        <tr key={e.key}>
          <td>
            <span className="pl-code">{e.key}</span>
          </td>
          <td>
            <span className="pl-code">{e.value}</span>
          </td>
          <td>{e.secret ? <Chip severity="warning">민감</Chip> : '—'}</td>
        </tr>
      ))}
    </Table>
  );
}

export function StackFiles() {
  return (
    <Table headers={['마운트 경로', '크기']}>
      {STACK_FILES.map((f) => (
        <tr key={f.path}>
          <td>
            <span className="pl-code">{f.path}</span>
          </td>
          <td>{f.size}</td>
        </tr>
      ))}
    </Table>
  );
}

export function StackRunDetail() {
  const { runId } = useParams();
  const r = STACK_RUNS.find((x) => x.id === runId) ?? STACK_RUNS[0];

  return (
    <>
      <PageHeader
        title={r.id}
        sub={`트리거: ${r.trigger} · ${r.startedAt} · ${r.duration}`}
        actions={<Chip severity={statusSeverity(r.status)}>{r.status}</Chip>}
      />
      <div className="pl-stack">
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>진행 단계</div>
          <div className="pl-row">
            <Chip severity="success">1. init</Chip>
            <Chip severity="success">2. plan</Chip>
            <Chip severity={r.status === '실패' ? 'danger' : 'success'}>3. apply</Chip>
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>플랜</div>
          <div className="pl-codeblock">
            Plan: {r.plan}{'\n'}
            {'\n'}~ aws_eks_node_group.default{'\n'}    instance_types: ["t3.large"] → ["t3.xlarge"]
          </div>
        </Card>
      </div>
    </>
  );
}

/* ═══ Kubernetes ═══════════════════════ */
const K8S_GROUPS: { label: string; items: { key: string; label: string }[] }[] = [
  {
    label: '워크로드',
    items: [
      { key: 'deployments', label: 'Deployments' },
      { key: 'pods', label: 'Pods' },
      { key: 'replicasets', label: 'ReplicaSets' },
      { key: 'statefulsets', label: 'StatefulSets' },
      { key: 'daemonsets', label: 'DaemonSets' },
      { key: 'jobs', label: 'Jobs' },
      { key: 'cronjobs', label: 'CronJobs' },
    ],
  },
  {
    label: '네트워크',
    items: [
      { key: 'services', label: 'Services' },
      { key: 'ingresses', label: 'Ingresses' },
      { key: 'networkpolicies', label: 'NetworkPolicies' },
    ],
  },
  {
    label: '스토리지',
    items: [
      { key: 'persistentvolumeclaims', label: 'PVCs' },
      { key: 'persistentvolumes', label: 'PVs' },
      { key: 'storageclasses', label: 'StorageClasses' },
    ],
  },
  {
    label: '구성',
    items: [
      { key: 'configmaps', label: 'ConfigMaps' },
      { key: 'secrets', label: 'Secrets' },
    ],
  },
  {
    label: '클러스터',
    items: [
      { key: 'nodes', label: 'Nodes' },
      { key: 'events', label: 'Events' },
      { key: 'namespaces', label: 'Namespaces' },
    ],
  },
  {
    label: 'RBAC',
    items: [
      { key: 'roles', label: 'Roles' },
      { key: 'clusterroles', label: 'ClusterRoles' },
      { key: 'serviceaccounts', label: 'ServiceAccounts' },
    ],
  },
];

export function KubernetesLayout() {
  const { clusterId = CLUSTERS[0].id } = useParams();
  const navigate = useNavigate();
  const cluster = CLUSTERS.find((c) => c.id === clusterId);

  return (
    <div className="pl-withsidenav">
      <div>
        <div style={{ padding: '0 12px 12px' }}>
          <select
            className="pl-input"
            style={{ height: 34, fontSize: 13 }}
            value={clusterId}
            onChange={(e) => navigate(`/console/kubernetes/${e.target.value}/deployments`)}
          >
            {CLUSTERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.version})
              </option>
            ))}
          </select>
          {cluster && (
            <div className="pl-muted" style={{ marginTop: 6 }}>
              노드 {cluster.nodes} · 팟 {cluster.pods.toLocaleString()}
            </div>
          )}
        </div>
        {K8S_GROUPS.map((g) => (
          <div key={g.label} style={{ marginBottom: 12 }}>
            <div className="pl-muted" style={{ padding: '4px 12px' }}>
              {g.label}
            </div>
            <SideNav
              items={g.items.map((it) => ({
                to: `/console/kubernetes/${clusterId}/${it.key}`,
                label: it.label,
              }))}
            />
          </div>
        ))}
      </div>
      <div className="pl-sidenav-body">
        <Outlet />
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

export function K8sResourceList() {
  const { clusterId = CLUSTERS[0].id, resource = 'deployments' } = useParams();
  const rows = getK8sResources(clusterId, resource);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<K8sResource | null>(null);
  const filtered = rows.filter((r) => r.name.includes(q));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const view = filtered.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);

  return (
    <>
      <PageHeader title={resource} sub={`${filtered.length.toLocaleString()}개 리소스`} />
      <div className="pl-toolbar">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(0);
          }}
          placeholder="이름 검색"
        />
        {pages > 1 && (
          <div className="pl-row">
            <Button size="small" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
              이전
            </Button>
            <span className="pl-muted">
              {cur + 1} / {pages} 페이지
            </span>
            <Button size="small" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
              다음
            </Button>
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="리소스 없음" message="이 유형의 리소스가 없거나 mock 데이터가 준비되지 않았어요." />
      ) : (
        <Table headers={['이름', '네임스페이스', '상태', '준비', '재시작', '나이']}>
          {view.map((r) => (
            <tr key={r.name} className="clickable" onClick={() => setSelected(r)}>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{r.namespace ?? '—'}</td>
              <td>
                <Chip severity={statusSeverity(r.status)}>{r.status}</Chip>
              </td>
              <td>{r.ready ?? '—'}</td>
              <td>{r.restarts ?? '—'}</td>
              <td>{r.age}</td>
            </tr>
          ))}
        </Table>
      )}
      <K8sResourceModal resource={selected} kind={resource} onClose={() => setSelected(null)} />
    </>
  );
}
