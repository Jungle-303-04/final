// RCA 인시던트 파이프라인 그래프 — incident → evidence → analysis → actions (docs/fd/06 § dashboard/rca)
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { useIncident } from '@/features/notifications/api';
import { Badge, Breadcrumbs, Card, KeyValue, QueryBoundary } from '@/shared/ui';
import { toneColor, toneOf } from '@/shared/ui/status';
import { FlowCanvas, useAutoLayout, type CollapsibleGroupData, type FlowEdgeData } from '@/shared/flow';
import { FadeSlideIn } from '@/shared/motion';
import { timeAgo } from '@/shared/lib/format';
import type { IncidentDetail, Tone } from '@/shared/lib/types';

/* 파이프라인 단계 순서 — current_subject 를 방어적으로 매핑(백엔드 subject 네이밍 변화 흡수) */
const STAGES = ['incident', 'evidence', 'analysis', 'actions'] as const;
type Stage = typeof STAGES[number];
const STAGE_LABEL: Record<Stage, string> = { incident: '인시던트', evidence: '증거 수집', analysis: '원인 분석', actions: '복구 조치' };
function stageOfSubject(subject: string): Stage {
  const s = subject.toLowerCase();
  if (/recovery|action|plan|command|execut|patch/.test(s)) return 'actions';
  if (/evidence|collect/.test(s)) return 'evidence';
  if (/analy|rca|root|diagnos/.test(s)) return 'analysis';
  return 'incident';
}
const TERMINAL = new Set(['completed', 'done', 'resolved', 'closed', 'failed', 'rejected']);
const trunc = (s: string, n = 44) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function StageNode({ data }: NodeProps<Node<{ label: string; sub?: string; tone: Tone; active: boolean }>>) {
  return (
    <div className={data.active ? 'flow-node--pulse' : undefined} style={{
      padding: '10px 14px', borderRadius: 'var(--radius-md)', minWidth: 150, textAlign: 'center',
      background: 'var(--surface-2)', border: `1.5px solid ${toneColor(data.tone)}`,
      color: 'var(--text-1)', fontSize: 'var(--fs-sm)', fontWeight: 600,
    }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {data.label}
      {data.sub && <div style={{ fontWeight: 400, fontSize: 'var(--fs-xs)', color: 'var(--text-2)', marginTop: 2 }}>{data.sub}</div>}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

function ItemNode({ data }: NodeProps<Node<{ label: string; tone: Tone }>>) {
  return (
    <div style={{
      padding: '6px 10px', borderRadius: 'var(--radius-sm)', maxWidth: 240,
      background: 'var(--surface-1)', border: '1px solid var(--border)',
      borderLeft: `2px solid ${toneColor(data.tone)}`,
      color: 'var(--text-2)', fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-mono)',
    }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {data.label}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { stage: StageNode, item: ItemNode };
type FlowEdge = Edge<FlowEdgeData>;

/* 인시던트 상세 → 그래프 모델. 좌표는 useAutoLayout(dagre)이 계산 */
function buildGraph(inc: IncidentDetail, collapsed: Record<string, boolean>, toggle: (id: string) => void) {
  const running = !TERMINAL.has(inc.status.toLowerCase());
  const cur = STAGES.indexOf(stageOfSubject(inc.current_subject));
  const failed = inc.status.toLowerCase() === 'failed' || !!inc.error_reason;
  const stageTone = (i: number): Tone => (i < cur ? 'ok' : i === cur ? (failed ? 'danger' : running ? 'info' : toneOf(inc.status)) : 'neutral');

  const nodes: Node[] = [];
  const edges: FlowEdge[] = [];
  const groupChildren = (groupId: string, items: { id: string; label: string; tone: Tone }[], activeGroup: boolean) => {
    if (collapsed[groupId]) return;
    items.forEach(it => {
      nodes.push({ id: it.id, type: 'item', position: { x: 0, y: 0 }, data: { label: it.label, tone: it.tone } });
      edges.push({ id: `e-${it.id}`, source: groupId, target: it.id, type: 'animated', data: { active: activeGroup && running } });
    });
  };

  nodes.push({ id: 'incident', type: 'stage', position: { x: 0, y: 0 }, data: { label: STAGE_LABEL.incident, sub: trunc(inc.summary), tone: stageTone(0), active: running && cur === 0 } });

  const evidence = [
    ...inc.supporting_evidence.map((e, i) => ({ id: `ev-${i}`, label: trunc(e), tone: 'ok' as Tone })),
    ...inc.missing_evidence.map((e, i) => ({ id: `miss-${i}`, label: `미수집: ${trunc(e)}`, tone: 'warn' as Tone })),
  ];
  nodes.push({ id: 'evidence', type: 'group_collapsible', position: { x: 0, y: 0 }, data: {
    label: STAGE_LABEL.evidence, count: evidence.length, collapsed: !!collapsed.evidence,
    tone: stageTone(1) === 'neutral' ? undefined : stageTone(1), active: running && cur === 1,
    onToggle: () => toggle('evidence'),
  } satisfies CollapsibleGroupData });
  groupChildren('evidence', evidence, cur === 1);

  const confidence = inc.confidence != null ? `신뢰도 ${(inc.confidence * 100).toFixed(0)}%` : undefined;
  nodes.push({ id: 'analysis', type: 'stage', position: { x: 0, y: 0 }, data: {
    label: STAGE_LABEL.analysis, sub: inc.root_cause ? `${trunc(inc.root_cause)}${confidence ? ` · ${confidence}` : ''}` : confidence,
    tone: stageTone(2), active: running && cur === 2,
  } });

  const actions = [
    ...(inc.action_route ? [{ id: 'act-route', label: `경로: ${trunc(inc.action_route)}`, tone: 'info' as Tone }] : []),
    ...(inc.command_id ? [{ id: 'act-cmd', label: `커맨드: ${trunc(inc.command_id)}`, tone: 'info' as Tone }] : []),
    ...(inc.pr_url ? [{ id: 'act-pr', label: `PR: ${trunc(inc.pr_url)}`, tone: 'ok' as Tone }] : []),
    ...(inc.error_reason ? [{ id: 'act-err', label: `실패: ${trunc(inc.error_reason)}`, tone: 'danger' as Tone }] : []),
  ];
  nodes.push({ id: 'actions', type: 'group_collapsible', position: { x: 0, y: 0 }, data: {
    label: STAGE_LABEL.actions, count: actions.length, collapsed: !!collapsed.actions,
    tone: stageTone(3) === 'neutral' ? undefined : stageTone(3), active: running && cur === 3,
    onToggle: () => toggle('actions'),
  } satisfies CollapsibleGroupData });
  groupChildren('actions', actions, cur === 3);

  // 메인 파이프라인 edge — 완료 ok / 현재 단계 진입 active / 실패 danger
  (['evidence', 'analysis', 'actions'] as const).forEach((target, i) => {
    const targetIdx = i + 1;
    const tone: Tone | undefined = targetIdx < cur ? 'ok' : targetIdx === cur && failed ? 'danger' : targetIdx === cur && !running ? 'ok' : undefined;
    edges.push({
      id: `main-${i}`, source: STAGES[i], target, type: 'animated',
      data: { active: running && targetIdx === cur, tone },
    });
  });
  return { nodes, edges };
}

export default function IncidentDetailView() {
  const { incidentId = '' } = useParams();
  const q = useIncident(incidentId);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setCollapsed(c => ({ ...c, [id]: !c[id] }));

  const raw = useMemo(
    () => (q.data ? buildGraph(q.data, collapsed, toggle) : { nodes: [] as Node[], edges: [] as FlowEdge[] }),
    [q.data, collapsed],
  );
  const { nodes, edges } = useAutoLayout(raw.nodes, raw.edges, 'LR');

  return (
    <FadeSlideIn>
      <Breadcrumbs items={[{ label: '알림', to: '/notifications' }, { label: `인시던트 ${incidentId}` }]} />
      <QueryBoundary query={q} skeletonLines={6}>{inc => (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0 14px' }}>
            <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>{inc.summary}</h1>
            <Badge status={inc.status} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
            <Card style={{ height: 420, padding: 0 }}>
              <FlowCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} />
            </Card>
            <Card title="상세">
              <KeyValue pairs={[
                ['클러스터', inc.cluster_id || '—'],
                ['현재 단계', inc.current_subject || '—'],
                ['근본 원인', inc.root_cause ?? '분석 중'],
                ['신뢰도', inc.confidence != null ? `${(inc.confidence * 100).toFixed(0)}%` : '—'],
                ['PR', inc.pr_url ? <a key="pr" href={inc.pr_url} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>{trunc(inc.pr_url, 28)}</a> : '—'],
                ['갱신', inc.updated_at ? timeAgo(inc.updated_at) : '—'],
              ]} />
            </Card>
          </div>
        </>
      )}</QueryBoundary>
    </FadeSlideIn>
  );
}
