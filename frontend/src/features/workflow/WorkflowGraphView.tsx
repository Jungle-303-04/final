import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { useApplications, useRunsAll } from '@/features/repo/api';
import { ApprovalCard } from '@/features/repo/ApprovalCard';
import { Badge, Breadcrumbs, Button, Card, CodeBlock, KeyValue, Skeleton } from '@/shared/ui';
import { PlanDiff } from '@/shared/ui/plan-diff';
import { IconCheck } from '@/shared/ui/icons';
import { toneColor, toneOf } from '@/shared/ui/status';
import { FlowCanvas, useAutoLayout, type FlowEdgeData } from '@/shared/flow';
import { shortSha } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import type { RunStep, WorkflowRun } from '@/shared/lib/types';

const ORDER = ['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING', 'SUCCEEDED'];
const TERMINAL = new Set(['SUCCEEDED', 'FAILED']);

function StepNode({ data }: NodeProps<Node<{ step: RunStep; active: boolean }>>) {
  const { step, active } = data;
  const tone = step.status === 'PENDING' ? 'neutral' : toneOf(step.status);
  return (
    <div className={active ? 'flow-node--pulse' : undefined} style={{
      padding: '10px 14px', borderRadius: 'var(--radius-md)', minWidth: 132, textAlign: 'center',
      background: step.status === 'PENDING' ? 'transparent' : 'var(--surface-2)',
      border: `1.5px solid ${step.status === 'PENDING' ? 'var(--border)' : toneColor(tone)}`,
      color: step.status === 'PENDING' ? 'var(--text-3)' : 'var(--text-1)',
      fontSize: 'var(--fs-sm)', fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {step.status === 'SUCCEEDED' && <IconCheck size={12} style={{ color: toneColor('ok') }} />}{step.name}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { step: StepNode };
type FlowEdge = Edge<FlowEdgeData>;

export default function WorkflowGraphView() {
  const { runId = '' } = useParams();
  const apps = useApplications();
  const all = useRunsAll(apps.data ?? []); // 활성 run 있으면 10s polling (repo/api)
  const found = all.items.flatMap(({ appId, runs }) => runs.map(r => ({ ...r, appId }))).find(r => r.run_id === runId);
  const [selected, setSelected] = useState<string | null>(null);

  const raw = useMemo(() => {
    if (!found) return { nodes: [] as Node[], edges: [] as FlowEdge[] };
    const run = found as WorkflowRun & { appId: string };
    const running = !TERMINAL.has(run.status);
    const statusIdx = ORDER.indexOf(run.status); // 진행 중이면 현재 단계 위치
    const nodes: Node[] = ORDER.map(name => {
      const step = run.steps.find(s => s.name === name) ?? { name, status: 'PENDING' };
      return { id: name, type: 'step', position: { x: 0, y: 0 }, data: { step, active: running && step.name === run.status } };
    });
    // edge 톤: 완료 구간 ok / 현재 단계 진입 edge 는 active(dash-flow) / 미도달 neutral
    const edges: FlowEdge[] = ORDER.slice(1).map((name, i) => {
      const targetIdx = i + 1;
      const done = run.status === 'SUCCEEDED' || (statusIdx >= 0 && targetIdx < statusIdx)
        || run.steps.find(s => s.name === name)?.status === 'SUCCEEDED';
      const active = running && statusIdx >= 0 && targetIdx === statusIdx;
      return {
        id: `e${i}`, source: ORDER[i], target: name, type: 'animated',
        data: { active, tone: done ? 'ok' as const : undefined },
      };
    });
    if (run.status === 'FAILED') {
      const failedAt = run.steps.find(s => s.status === 'FAILED')?.name ?? 'POLICY_CHECKING';
      nodes.push({ id: 'FAILED', type: 'step', position: { x: 0, y: 0 }, data: { step: { name: 'FAILED', status: 'FAILED' }, active: false } });
      edges.push({ id: 'ef', source: failedAt, target: 'FAILED', type: 'animated', data: { active: false, tone: 'danger' } });
    }
    return { nodes, edges };
  }, [found]);
  const { nodes, edges } = useAutoLayout(raw.nodes, raw.edges, 'LR');

  if (!found) {
    // 목록·개별 runs 쿼리가 아직 로딩 중이면 스켈레톤 — 성급한 '없음' 표시 금지
    if (apps.isPending || ((apps.data ?? []).length > 0 && all.pending)) return <Skeleton lines={5} />;
    return (
      <Card>
        <p style={{ margin: '0 0 10px' }}>run 을 찾을 수 없습니다: <code>{runId}</code></p>
        <p style={{ margin: '0 0 10px', color: 'var(--text-3)', fontSize: 'var(--fs-sm)' }}>이미 정리됐거나 접근 권한이 없는 run 일 수 있습니다.</p>
        <Link to="/workflows"><Button>워크플로우 목록으로 →</Button></Link>
      </Card>
    );
  }
  const selectedStep = selected ? found.steps.find(s => s.name === selected) : null;

  return (
    <FadeSlideIn>
      <Breadcrumbs items={[{ label: '워크플로우', to: '/workflows' }, { label: `${found.appId} · ${shortSha(found.commit_sha)}` }]} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0 14px', flexWrap: 'wrap', minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)', overflowWrap: 'anywhere' }}>{found.appId}</h1>
        <code>{shortSha(found.commit_sha)}</code><Badge status={found.status} />
      </div>
      {found.status === 'WAITING_FOR_APPROVAL' && found.approval_id && (() => {
        const diffStep = found.steps.find(s => s.name === 'DIFFING');
        return (
          <div style={{ marginBottom: 12 }}>
            <ApprovalCard approvalId={found.approval_id} summary={`${shortSha(found.commit_sha)} 배포 승인${diffStep?.detail ? ` — diff: ${diffStep.detail}` : ''}`} />
            {diffStep?.changes && diffStep.changes.length > 0 && (
              <div className="card" style={{ marginTop: 8, padding: 12 }}>
                <b style={{ fontSize: 'var(--fs-sm)' }}>적용될 변경 (plan)</b>
                <div style={{ marginTop: 8 }}><PlanDiff changes={diffStep.changes} resource={diffStep.resource} /></div>
              </div>
            )}
          </div>
        );
      })()}
      <div className="split split--side">
        <Card style={{ height: 340, padding: 0 }}>
          <FlowCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={setSelected} />
        </Card>
        <Card title={selected ?? '단계 상세'}>
          {selectedStep
            ? <KeyValue pairs={[['상태', <Badge key="b" status={selectedStep.status === 'PENDING' ? 'unknown' : selectedStep.status} />], ['상세', selectedStep.detail ?? '—']]} />
            : <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-sm)' }}>노드를 클릭하면 산출물이 표시됩니다.</p>}
          {selectedStep?.changes && selectedStep.changes.length > 0
            ? <div style={{ marginTop: 8 }}><PlanDiff changes={selectedStep.changes} resource={selectedStep.resource} /></div>
            : selectedStep?.name === 'DIFFING' && selectedStep.detail && <CodeBlock code={selectedStep.detail} />}
        </Card>
      </div>
    </FadeSlideIn>
  );
}
