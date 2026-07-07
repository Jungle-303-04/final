// RCA 인시던트 파이프라인 그래프 — incident → evidence → analysis → actions (docs/fd/06 § dashboard/rca)
// + 저장된 증거(/evidence)·RCA 리포트(/rca-reports) 실데이터 패널
import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { useEvidence, useIncident, useRcaReports } from '@/features/notifications/api';
import { Badge, Breadcrumbs, Button, Card, CodeBlock, CopyChip, EmptyState, KeyValue, QueryBoundary, Skeleton } from '@/shared/ui';
import { toneColor, toneOf } from '@/shared/ui/status';
import { FlowCanvas, useAutoLayout, type CollapsibleGroupData, type FlowEdgeData } from '@/shared/flow';
import { AnimatePresence, FadeSlideIn } from '@/shared/motion';
import { motion } from 'motion/react';
import { fmtAbs, timeAgo } from '@/shared/lib/format';
import type { EvidenceRecord, IncidentDetail, RcaReportSummary, Tone } from '@/shared/lib/types';
import { IconAlertTriangle, IconFile } from '@/shared/ui/icons';

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

/* evidence kind → 색/라벨 — 백엔드 kind 어휘(kubernetes/prometheus/loki/tempo) */
const KIND_TONE: Record<string, Tone> = { kubernetes: 'info', prometheus: 'warn', loki: 'ok', tempo: 'neutral' };
const kindTone = (kind: string): Tone => KIND_TONE[kind] ?? 'neutral';

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
  const evidenceRef = useRef<HTMLDivElement>(null);

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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 0 14px', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>{inc.summary}</h1>
            <Badge status={inc.status} />
            {inc.correlation_id && <CopyChip value={inc.correlation_id} display={`corr ${trunc(inc.correlation_id, 22)}`} />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
            <Card style={{ height: 420, padding: 0 }}>
              <FlowCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} />
            </Card>
            <Card title="상세">
              <KeyValue pairs={[
                ['클러스터', inc.cluster_id ? <Link key="c" to={`/clusters/${inc.cluster_id}`} style={{ color: 'var(--brand)' }}>{inc.cluster_id}</Link> : '—'],
                ['현재 단계', inc.current_subject || '—'],
                ['근본 원인', inc.root_cause ?? '분석 중'],
                ['신뢰도', inc.confidence != null ? `${(inc.confidence * 100).toFixed(0)}%` : '—'],
                ['correlation', inc.correlation_id ? <CopyChip key="corr" value={inc.correlation_id} display={trunc(inc.correlation_id, 18)} /> : '—'],
                ['커맨드', inc.command_id ? <code key="cmd" style={{ fontSize: 'var(--fs-xs)' }}>{trunc(inc.command_id, 18)}</code> : '—'],
                ['PR', inc.pr_url ? <a key="pr" href={inc.pr_url} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>{trunc(inc.pr_url, 28)}</a> : '—'],
                ['갱신', inc.updated_at ? <span key="t" title={fmtAbs(inc.updated_at)}>{timeAgo(inc.updated_at)} · {fmtAbs(inc.updated_at)}</span> : '—'],
              ]} />
              {inc.error_reason && (
                <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-xs)', marginBottom: 0 }}>실패 사유: {inc.error_reason}</p>
              )}
            </Card>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, alignItems: 'start' }}>
            <RcaReportsPanel correlationId={inc.correlation_id} onShowEvidence={() => evidenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
            <div ref={evidenceRef}><EvidencePanel correlationId={inc.correlation_id} /></div>
          </div>
        </>
      )}</QueryBoundary>
    </FadeSlideIn>
  );
}

/* ── 저장된 증거 목록 — GET /evidence?correlation_id= ─────────────────────── */
const EVIDENCE_KINDS = ['kubernetes', 'prometheus', 'loki', 'tempo'] as const;

function EvidencePanel({ correlationId }: { correlationId: string }) {
  const q = useEvidence(correlationId || undefined);
  const [kindFilter, setKindFilter] = useState<string>('all');
  if (!correlationId) {
    return <Card title="증거"><EmptyState icon={<IconFile size={26} />} title="correlation id가 없어 증거를 조회할 수 없습니다" /></Card>;
  }
  const items = q.data?.items ?? [];
  const presentKinds = new Set(items.map(i => i.kind));
  const rows = items.filter(i => kindFilter === 'all' || i.kind === kindFilter);
  return (
    <Card title={<span>증거 {q.data ? <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 'var(--fs-xs)' }}>({items.length}건{q.data.has_more ? ' · 최근 100건 표시' : ''})</span> : null}</span>}>
      {q.isPending ? <Skeleton lines={4} /> : q.isError ? (
        <EmptyState icon={<IconAlertTriangle size={26} />} title="증거를 불러오지 못했습니다"
          description={(q.error as Error).message} action={<Button size="sm" onClick={() => q.refetch()}>다시 시도</Button>} />
      ) : items.length === 0 ? (
        <EmptyState icon={<IconFile size={26} />} title="저장된 증거가 아직 없습니다"
          description="에이전트가 증거를 수집·업로드하면 여기 표시됩니다" />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <button className={`btn btn--sm ${kindFilter === 'all' ? '' : 'btn--ghost'}`} onClick={() => setKindFilter('all')}>전체</button>
            {EVIDENCE_KINDS.filter(k => presentKinds.has(k)).map(k => (
              <button key={k} className={`btn btn--sm ${kindFilter === k ? '' : 'btn--ghost'}`} onClick={() => setKindFilter(k)}>{k}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(e => <EvidenceRow key={e.id} record={e} />)}
            {rows.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 'var(--fs-sm)', margin: 0 }}>선택한 종류의 증거가 없습니다</p>}
          </div>
        </>
      )}
    </Card>
  );
}

/* payload 를 한 줄 요약 — 상위 키 3개 key=value (원문은 펼쳐서 확인) */
function payloadSummary(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload).slice(0, 3)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return trunc(entries.join(' · '), 96) || '(빈 payload)';
}

function EvidenceRow({ record }: { record: EvidenceRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ background: 'var(--surface-2)', padding: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap' }}
        onClick={() => setOpen(o => !o)} role="button" aria-expanded={open}>
        <Badge tone={kindTone(record.kind)}>{record.kind}</Badge>
        <code style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>#{record.id}</code>
        <span style={{ flex: 1, fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {payloadSummary(record.payload)}
        </span>
        {record.created_at && (
          <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }} title={fmtAbs(record.created_at)}>{timeAgo(record.created_at)}</span>
        )}
        <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{open ? '▾' : '▸'}</span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} style={{ overflow: 'hidden' }}>
            <div style={{ marginTop: 8 }}>
              {record.created_at && <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>수집 시각: {fmtAbs(record.created_at)}</p>}
              <CodeBlock code={JSON.stringify(record.payload, null, 2)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── RCA 리포트 — GET /rca-reports?correlation_id= ────────────────────────── */
function RcaReportsPanel({ correlationId, onShowEvidence }: { correlationId: string; onShowEvidence: () => void }) {
  const q = useRcaReports(correlationId || undefined);
  if (!correlationId) {
    return <Card title="RCA 리포트"><EmptyState icon={<IconFile size={26} />} title="correlation id가 없어 리포트를 조회할 수 없습니다" /></Card>;
  }
  return (
    <Card title="RCA 리포트">
      {q.isPending ? <Skeleton lines={4} /> : q.isError ? (
        <EmptyState icon={<IconAlertTriangle size={26} />} title="리포트를 불러오지 못했습니다"
          description={(q.error as Error).message} action={<Button size="sm" onClick={() => q.refetch()}>다시 시도</Button>} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon={<IconFile size={26} />} title="생성된 RCA 리포트가 아직 없습니다"
          description="원인 분석이 완료되면 리포트가 저장됩니다" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(q.data ?? []).map(r => <RcaReportCard key={r.id} report={r} onShowEvidence={onShowEvidence} />)}
        </div>
      )}
    </Card>
  );
}

function RcaReportCard({ report, onShowEvidence }: { report: RcaReportSummary; onShowEvidence: () => void }) {
  const sevTone: Tone = report.severity === 'critical' || report.severity === 'high' ? 'danger'
    : report.severity === 'medium' ? 'warn' : report.severity ? 'info' : 'neutral';
  return (
    <div className="card" style={{ background: 'var(--surface-2)', padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        {report.severity && <Badge tone={sevTone}>{report.severity}</Badge>}
        <Badge status={report.action}>{report.action}</Badge>
        {report.confidence != null && (
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-2)' }}>신뢰도 <b>{(report.confidence * 100).toFixed(0)}%</b></span>
        )}
        {report.created_at && (
          <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }} title={fmtAbs(report.created_at)}>
            {timeAgo(report.created_at)}
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{report.root_cause}</p>
      {report.symptom && <p style={{ margin: '0 0 4px', fontSize: 'var(--fs-xs)', color: 'var(--text-2)' }}>증상: {report.symptom}</p>}
      {report.reason && <p style={{ margin: '0 0 8px', fontSize: 'var(--fs-xs)', color: 'var(--text-2)' }}>판단 근거: {report.reason}</p>}
      {report.supporting_evidence.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
          {report.supporting_evidence.map((e, i) => (
            <span key={i} className="badge" style={{ color: 'var(--ok)' }}><span className="dot" />{trunc(e, 40)}</span>
          ))}
        </div>
      )}
      {report.missing_evidence.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
          {report.missing_evidence.map((e, i) => (
            <span key={i} className="badge" style={{ color: 'var(--warn)' }}><span className="dot" />미수집: {trunc(e, 36)}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <Button size="sm" onClick={onShowEvidence}>증거 흐름 보기 →</Button>
        {report.evidence_ref && <code style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>{trunc(report.evidence_ref, 30)}</code>}
        <CopyChip value={report.correlation_id} display={trunc(report.correlation_id, 16)} />
      </div>
    </div>
  );
}
