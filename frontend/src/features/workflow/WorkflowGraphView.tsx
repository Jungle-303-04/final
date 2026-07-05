import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useApplications, useRunsAll } from '@/features/repo/api';
import { ApprovalCard } from '@/features/repo/ApprovalCard';
import { Badge, Breadcrumbs, Card, CodeBlock, KeyValue, Skeleton } from '@/shared/ui';
import { toneColor, toneOf } from '@/shared/ui/status';
import { shortSha } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import type { RunStep, WorkflowRun } from '@/shared/lib/types';

const ORDER = ['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING', 'SUCCEEDED'];

function StepNode({ data }: NodeProps<Node<{ step: RunStep; active: boolean }>>) {
  const { step, active } = data;
  const tone = step.status === 'PENDING' ? 'neutral' : toneOf(step.status);
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, minWidth: 132, textAlign: 'center',
      background: step.status === 'PENDING' ? 'transparent' : 'var(--surface-2)',
      border: `1.5px solid ${step.status === 'PENDING' ? 'var(--border)' : toneColor(tone)}`,
      color: step.status === 'PENDING' ? 'var(--text-3)' : 'var(--text-1)',
      fontSize: 12, fontWeight: 600,
      animation: active ? 'pulse 1.4s infinite' : undefined,
    }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {step.status === 'SUCCEEDED' && '✓ '}{step.name}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { step: StepNode };

export default function WorkflowGraphView() {
  const { runId = '' } = useParams();
  const apps = useApplications();
  const all = useRunsAll(apps.data ?? []);
  const found = all.flatMap(({ appId, runs }) => runs.map(r => ({ ...r, appId }))).find(r => r.run_id === runId);
  const [selected, setSelected] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    if (!found) return { nodes: [] as Node[], edges: [] as Edge[] };
    const run = found as WorkflowRun & { appId: string };
    const nodes: Node[] = ORDER.map((name, i) => {
      const step = run.steps.find(s => s.name === name) ?? { name, status: 'PENDING' };
      return { id: name, type: 'step', position: { x: i * 170, y: 60 + (i % 2) * 8 }, data: { step, active: step.status !== 'PENDING' && step.status === run.status && !['SUCCEEDED', 'FAILED'].includes(run.status) } };
    });
    const edges: Edge[] = ORDER.slice(1).map((name, i) => ({
      id: `e${i}`, source: ORDER[i], target: name, animated: run.steps.find(s => s.name === name)?.status !== 'PENDING' && !['SUCCEEDED', 'FAILED'].includes(run.status),
      style: { stroke: 'var(--border)' },
    }));
    if (run.status === 'FAILED') {
      const failedAt = run.steps.find(s => s.status === 'FAILED')?.name ?? 'POLICY_CHECKING';
      nodes.push({ id: 'FAILED', type: 'step', position: { x: ORDER.indexOf(failedAt) * 170 + 90, y: 170 }, data: { step: { name: 'FAILED', status: 'FAILED' }, active: false } });
      edges.push({ id: 'ef', source: failedAt, target: 'FAILED', style: { stroke: 'var(--danger)', strokeDasharray: '4 3' } });
    }
    return { nodes, edges };
  }, [found]);

  if (!found) return apps.isPending ? <Skeleton lines={5} /> : <Card>run 을 찾을 수 없습니다: {runId}</Card>;
  const selectedStep = selected ? found.steps.find(s => s.name === selected) : null;

  return (
    <FadeSlideIn>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.55} }`}</style>
      <Breadcrumbs items={[{ label: '워크플로우', to: '/workflows' }, { label: `${found.appId} · ${shortSha(found.commit_sha)}` }]} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0 14px' }}>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>{found.appId}</h1>
        <code>{shortSha(found.commit_sha)}</code><Badge status={found.status} />
      </div>
      {found.status === 'WAITING_FOR_APPROVAL' && found.approval_id && (
        <div style={{ marginBottom: 12 }}><ApprovalCard approvalId={found.approval_id} summary={`${shortSha(found.commit_sha)} 배포 승인 — diff: ${found.steps.find(s => s.name === 'DIFFING')?.detail ?? ''}`} /></div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        <Card style={{ height: 340, padding: 0 }}>
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}
            onNodeClick={(_e, n) => setSelected(n.id)} nodesDraggable={false} nodesConnectable={false} colorMode="dark">
            <Background gap={20} color="var(--surface-2)" />
          </ReactFlow>
        </Card>
        <Card title={selected ?? '단계 상세'}>
          {selectedStep
            ? <KeyValue pairs={[['상태', <Badge key="b" status={selectedStep.status === 'PENDING' ? 'unknown' : selectedStep.status} />], ['상세', selectedStep.detail ?? '—']]} />
            : <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-sm)' }}>노드를 클릭하면 산출물이 표시됩니다.</p>}
          {selectedStep?.name === 'DIFFING' && selectedStep.detail && <CodeBlock code={selectedStep.detail} />}
        </Card>
      </div>
    </FadeSlideIn>
  );
}
