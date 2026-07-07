// RCA 인시던트 파이프라인 그래프 + 저장된 증거/RCA 리포트 실데이터 패널.
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { useEvidence, useIncident, useRcaReports, useRecoveryPlan } from '@/features/notifications/api';
import { FlowCanvas, useAutoLayout, type CollapsibleGroupData, type FlowEdgeData } from '@/shared/flow';
import { fmtAbs, timeAgo } from '@/shared/lib/format';
import type {
  EvidenceRecord,
  IncidentDetail,
  RcaCandidateScore,
  RcaEvidenceRef,
  RcaReportSummary,
  RecoveryActionCandidate,
  RecoveryPlanStatus,
  Tone,
} from '@/shared/lib/types';
import { useConsolePath } from '@/features/console/ui';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  CodeBlock,
  Collapsible,
  EmptyState,
  KeyValueList,
  PageHeader,
  Skeleton,
  cx,
  useToast,
} from '@/ui';

const STAGES = ['incident', 'evidence', 'analysis', 'actions'] as const;
type Stage = typeof STAGES[number];
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type FlowEdge = Edge<FlowEdgeData>;

const STAGE_LABEL: Record<Stage, string> = { incident: '인시던트', evidence: '증거 수집', analysis: '원인 분석', actions: '복구 조치' };
const TERMINAL = new Set(['completed', 'done', 'resolved', 'closed', 'failed', 'rejected']);
const EVIDENCE_KINDS = ['kubernetes', 'prometheus', 'loki', 'tempo'] as const;
const KIND_TONE: Record<string, Tone> = { kubernetes: 'info', prometheus: 'warn', loki: 'ok', tempo: 'neutral' };

const trunc = (value: string, size = 44) => (value.length > size ? `${value.slice(0, size - 1)}...` : value);
const kindTone = (kind: string): Tone => KIND_TONE[kind] ?? 'neutral';

function stageOfSubject(subject: string): Stage {
  const value = subject.toLowerCase();
  if (/recovery|action|plan|command|execut|patch/.test(value)) return 'actions';
  if (/evidence|collect/.test(value)) return 'evidence';
  if (/analy|rca|root|diagnos/.test(value)) return 'analysis';
  return 'incident';
}

function StageNode({ data }: NodeProps<Node<{ label: string; sub?: string; tone: Tone; active: boolean }>>) {
  return (
    <div className={cx('min-w-40 rounded-panel border bg-surface px-4 py-3 text-center shadow-soft', flowToneClass(data.tone), data.active && 'flow-node--pulse')}>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <div className="text-body font-semibold text-primary">{data.label}</div>
      {data.sub && <div className="mt-1 max-w-52 truncate text-caption font-normal text-secondary">{data.sub}</div>}
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

function ItemNode({ data }: NodeProps<Node<{ label: string; tone: Tone }>>) {
  return (
    <div className={cx('max-w-64 rounded-control border bg-bg px-3 py-2 font-mono text-caption text-secondary shadow-soft', flowToneClass(data.tone))}>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <span className="block truncate">{data.label}</span>
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

const nodeTypes = { stage: StageNode, item: ItemNode };

function buildGraph(incident: IncidentDetail, collapsed: Record<string, boolean>, toggle: (id: string) => void) {
  const running = !TERMINAL.has(incident.status.toLowerCase());
  const current = STAGES.indexOf(stageOfSubject(incident.current_subject));
  const failed = incident.status.toLowerCase() === 'failed' || Boolean(incident.error_reason);
  const stageTone = (index: number): Tone => {
    if (index < current) return 'ok';
    if (index === current && failed) return 'danger';
    if (index === current && running) return 'info';
    if (index === current) return toneOfStatus(incident.status);
    return 'neutral';
  };

  const nodes: Node[] = [];
  const edges: FlowEdge[] = [];
  const groupChildren = (groupId: string, items: { id: string; label: string; tone: Tone }[], activeGroup: boolean) => {
    if (collapsed[groupId]) return;
    items.forEach((item) => {
      nodes.push({ id: item.id, type: 'item', position: { x: 0, y: 0 }, data: { label: item.label, tone: item.tone } });
      edges.push({ id: `e-${item.id}`, source: groupId, target: item.id, type: 'animated', data: { active: activeGroup && running } });
    });
  };

  nodes.push({
    id: 'incident',
    type: 'stage',
    position: { x: 0, y: 0 },
    data: { label: STAGE_LABEL.incident, sub: trunc(incident.summary), tone: stageTone(0), active: running && current === 0 },
  });

  const evidence = [
    ...incident.supporting_evidence.map((item, index) => ({ id: `ev-${index}`, label: trunc(item), tone: 'ok' as Tone })),
    ...incident.missing_evidence.map((item, index) => ({ id: `miss-${index}`, label: `미수집: ${trunc(item)}`, tone: 'warn' as Tone })),
  ];
  nodes.push({
    id: 'evidence',
    type: 'group_collapsible',
    position: { x: 0, y: 0 },
    data: {
      label: STAGE_LABEL.evidence,
      count: evidence.length,
      collapsed: Boolean(collapsed.evidence),
      tone: stageTone(1) === 'neutral' ? undefined : stageTone(1),
      active: running && current === 1,
      onToggle: () => toggle('evidence'),
    } satisfies CollapsibleGroupData,
  });
  groupChildren('evidence', evidence, current === 1);

  const confidence = incident.confidence != null ? `신뢰도 ${(incident.confidence * 100).toFixed(0)}%` : undefined;
  nodes.push({
    id: 'analysis',
    type: 'stage',
    position: { x: 0, y: 0 },
    data: {
      label: STAGE_LABEL.analysis,
      sub: incident.root_cause ? `${trunc(incident.root_cause)}${confidence ? ` · ${confidence}` : ''}` : confidence,
      tone: stageTone(2),
      active: running && current === 2,
    },
  });

  const actions = [
    ...(incident.action_route ? [{ id: 'act-route', label: `경로: ${trunc(incident.action_route)}`, tone: 'info' as Tone }] : []),
    ...(incident.command_id ? [{ id: 'act-cmd', label: `커맨드: ${trunc(incident.command_id)}`, tone: 'info' as Tone }] : []),
    ...(incident.pr_url ? [{ id: 'act-pr', label: `PR: ${trunc(incident.pr_url)}`, tone: 'ok' as Tone }] : []),
    ...(incident.error_reason ? [{ id: 'act-err', label: `실패: ${trunc(incident.error_reason)}`, tone: 'danger' as Tone }] : []),
  ];
  nodes.push({
    id: 'actions',
    type: 'group_collapsible',
    position: { x: 0, y: 0 },
    data: {
      label: STAGE_LABEL.actions,
      count: actions.length,
      collapsed: Boolean(collapsed.actions),
      tone: stageTone(3) === 'neutral' ? undefined : stageTone(3),
      active: running && current === 3,
      onToggle: () => toggle('actions'),
    } satisfies CollapsibleGroupData,
  });
  groupChildren('actions', actions, current === 3);

  (['evidence', 'analysis', 'actions'] as const).forEach((target, index) => {
    const targetIndex = index + 1;
    const tone: Tone | undefined = targetIndex < current ? 'ok' : targetIndex === current && failed ? 'danger' : targetIndex === current && !running ? 'ok' : undefined;
    edges.push({ id: `main-${index}`, source: STAGES[index], target, type: 'animated', data: { active: running && targetIndex === current, tone } });
  });
  return { nodes, edges };
}

export default function IncidentDetailView() {
  const { incidentId = '' } = useParams();
  const q = useIncident(incidentId);
  const pathFor = useConsolePath();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = useCallback((id: string) => setCollapsed((value) => ({ ...value, [id]: !value[id] })), []);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const showEvidence = () => evidenceRef.current?.scrollIntoView({ block: 'start' });

  const raw = useMemo(
    () => (q.data ? buildGraph(q.data, collapsed, toggle) : { nodes: [] as Node[], edges: [] as FlowEdge[] }),
    [collapsed, q.data, toggle],
  );
  const { nodes, edges } = useAutoLayout(raw.nodes, raw.edges, 'LR');
  const notFound = q.isError && (q.error as { kind?: string }).kind === 'not_found';

  if (notFound) {
    return (
      <div className="grid gap-6">
        <PageHeader
          title="인시던트 타임라인 상세를 찾을 수 없습니다"
          description="파이프라인 상태 행이 정리됐을 수 있습니다. 아래는 동일 correlation으로 저장된 RCA 리포트와 증거입니다"
          breadcrumb={<Breadcrumb items={[{ label: '인시던트', href: pathFor('/incidents') }, { label: `인시던트 ${incidentId}` }]} />}
          actions={<CopyPill value={incidentId} display={trunc(incidentId, 22)} />}
        />
        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <RecoveryPlanPanel correlationId={incidentId} standalone />
          </Card>
          <RcaReportsPanel correlationId={incidentId} onShowEvidence={showEvidence} />
        </section>
        <div ref={evidenceRef}>
          <EvidencePanel correlationId={incidentId} />
        </div>
      </div>
    );
  }

  if (q.isPending) {
    return (
      <div className="grid gap-6">
        <PageHeader title="인시던트" breadcrumb={<Breadcrumb items={[{ label: '인시던트', href: pathFor('/incidents') }, { label: `인시던트 ${incidentId}` }]} />} />
        <Card><Skeleton lines={6} /></Card>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="grid gap-6">
        <PageHeader title="인시던트 조회 실패" breadcrumb={<Breadcrumb items={[{ label: '인시던트', href: pathFor('/incidents') }, { label: `인시던트 ${incidentId}` }]} />} />
        <Card>
          <EmptyState title="인시던트 조회 실패" description={(q.error as Error).message} action={<Button onClick={() => q.refetch()}>다시 시도</Button>} />
        </Card>
      </div>
    );
  }

  const incident = q.data;
  if (!incident) {
    return (
      <Card>
        <EmptyState title="인시던트 없음" description="표시할 인시던트 상세가 없습니다" />
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={incident.summary}
        description={`${STAGE_LABEL[stageOfSubject(incident.current_subject)]} · ${incident.updated_at ? fmtAbs(incident.updated_at) : '갱신 시각 없음'}`}
        breadcrumb={<Breadcrumb items={[{ label: '인시던트', href: pathFor('/incidents') }, { label: `인시던트 ${incidentId}` }]} />}
        actions={incident.correlation_id ? <CopyPill value={incident.correlation_id} display={`corr ${trunc(incident.correlation_id, 22)}`} /> : undefined}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.75fr)]">
        <Card title="RCA 파이프라인" description="단계와 근거 흐름을 그래프로 확인합니다">
          <div className="max-w-full overflow-x-auto">
            <div className="h-96 min-w-[42rem] overflow-hidden rounded-panel border border-border bg-bg">
              <FlowCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} />
            </div>
          </div>
        </Card>
        <Card title="상세">
          <div className="grid gap-4">
            <KeyValueList items={[
              { label: '상태', value: <StatusBadge status={incident.status} /> },
              { label: '클러스터', value: incident.cluster_id ? <Link className="text-accent hover:text-accent-hover" to={pathFor(`/clusters/${incident.cluster_id}`)}>{incident.cluster_id}</Link> : '없음' },
              { label: '현재 단계', value: incident.current_subject || '없음' },
              { label: '근본 원인', value: incident.root_cause ?? '분석 중' },
              { label: '신뢰도', value: incident.confidence != null ? `${(incident.confidence * 100).toFixed(0)}%` : '없음' },
              { label: 'correlation', value: incident.correlation_id ? <CopyPill value={incident.correlation_id} display={trunc(incident.correlation_id, 18)} /> : '없음' },
              { label: '커맨드', value: incident.command_id ? <CodeText>{trunc(incident.command_id, 18)}</CodeText> : '없음' },
              { label: 'PR', value: incident.pr_url ? <a className="text-accent hover:text-accent-hover" href={incident.pr_url} target="_blank" rel="noreferrer">{trunc(incident.pr_url, 28)}</a> : '없음' },
              { label: '갱신', value: incident.updated_at ? <span title={fmtAbs(incident.updated_at)}>{timeAgo(incident.updated_at)} · {fmtAbs(incident.updated_at)}</span> : '없음' },
            ]} />
            {incident.error_reason && <p className="text-caption font-medium text-danger">실패 사유: {incident.error_reason}</p>}
            <RecoveryPlanPanel correlationId={incident.correlation_id} />
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <RcaReportsPanel correlationId={incident.correlation_id} onShowEvidence={showEvidence} />
        <div ref={evidenceRef}><EvidencePanel correlationId={incident.correlation_id} /></div>
      </section>
    </div>
  );
}

function RecoveryPlanPanel({ correlationId, standalone = false }: { correlationId: string; standalone?: boolean }) {
  const q = useRecoveryPlan(correlationId || undefined);
  const missing = q.isError && (q.error as { kind?: string }).kind === 'not_found';
  const plan = q.data;
  return (
    <section className={standalone ? 'grid gap-3' : 'grid gap-3 border-t border-border pt-4'}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-title font-semibold text-primary">복구 계획</h2>
        {plan && <Badge tone={toneToBadge(recoveryPlanTone(plan))}>{plan.status}</Badge>}
      </div>
      {q.isPending ? (
        <Skeleton lines={2} />
      ) : missing ? (
        <Badge>생성 전</Badge>
      ) : q.isError ? (
        <EmptyState icon={<AlertIcon />} title="복구 계획 조회 실패" description={(q.error as Error).message} action={<Button size="sm" onClick={() => q.refetch()}>다시 시도</Button>} />
      ) : plan ? (
        <RecoveryPlanSummary plan={plan} />
      ) : (
        <EmptyState title="복구 계획 없음" />
      )}
    </section>
  );
}

function RecoveryPlanSummary({ plan }: { plan: RecoveryPlanStatus }) {
  const selected = plan.selected_action;
  const recommended = plan.candidates.find((candidate) => candidate.action_id === plan.recommended_action_id) ?? null;
  const visible = [
    ...(selected ? [selected] : []),
    ...plan.candidates.filter((candidate) => candidate.action_id !== selected?.action_id).slice(0, selected ? 2 : 3),
  ];
  return (
    <div className="grid gap-3">
      <p className="text-caption text-secondary">{plan.summary}</p>
      <KeyValueList items={[
        { label: '경로', value: plan.execution_route },
        { label: '추천', value: recommended ? recommended.title : plan.recommended_action_id },
        { label: '선택', value: selected ? selected.title : plan.selection_required ? '선택 대기' : '자동 진행' },
      ]} />
      <div className="grid gap-2">
        {visible.map((candidate) => (
          <RecoveryCandidateRow
            key={candidate.action_id}
            candidate={candidate}
            recommended={candidate.action_id === plan.recommended_action_id}
            selected={candidate.action_id === plan.selected_action_id}
          />
        ))}
      </div>
      {plan.selected_by && <span className="text-caption text-muted">선택자: <CodeText>{plan.selected_by}</CodeText></span>}
    </div>
  );
}

function RecoveryCandidateRow({ candidate, recommended, selected }: { candidate: RecoveryActionCandidate; recommended: boolean; selected: boolean }) {
  return (
    <div className={cx('grid gap-2 rounded-control border bg-raised p-3', selected ? 'border-success/50' : recommended ? 'border-info/50' : 'border-border')}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-label font-semibold text-primary">{candidate.title}</span>
        {selected && <Badge tone="success">선택</Badge>}
        {recommended && !selected && <Badge tone="info">추천</Badge>}
        {candidate.approval_required && <Badge tone="warning">승인 필요</Badge>}
        <span className="ms-auto text-caption text-muted">{candidate.route}</span>
      </div>
      <p className="text-caption text-muted">
        {candidate.description} · 위험 {candidate.risk_level} · 영향 {candidate.blast_radius}
      </p>
      {candidate.rollback_plan && <p className="text-caption text-secondary">롤백: {candidate.rollback_plan}</p>}
    </div>
  );
}

function recoveryPlanTone(plan: RecoveryPlanStatus): Tone {
  if (plan.status === 'selected') return 'ok';
  if (plan.status === 'selection_requested') return 'warn';
  return plan.selection_required ? 'info' : 'neutral';
}

function EvidencePanel({ correlationId }: { correlationId: string }) {
  const q = useEvidence(correlationId || undefined);
  const [kindFilter, setKindFilter] = useState('all');
  if (!correlationId) {
    return <Card title="증거" empty={<EmptyState icon={<FileIcon />} title="correlation 없음" description="correlation id가 없어 증거를 조회할 수 없습니다" />}><span /></Card>;
  }
  const items = q.data?.items ?? [];
  const presentKinds = new Set(items.map((item) => item.kind));
  const rows = items.filter((item) => kindFilter === 'all' || item.kind === kindFilter);
  const title = q.data ? `증거 ${items.length.toLocaleString()}건${q.data.has_more ? ' · 최근 100건' : ''}` : '증거';
  return (
    <Card title={title}>
      {q.isPending ? (
        <Skeleton lines={4} />
      ) : q.isError ? (
        <EmptyState icon={<AlertIcon />} title="증거 조회 실패" description={(q.error as Error).message} action={<Button size="sm" onClick={() => q.refetch()}>다시 시도</Button>} />
      ) : items.length === 0 ? (
        <EmptyState icon={<FileIcon />} title="저장된 증거 없음" description="이 correlation에 저장된 증거가 아직 없습니다" />
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={kindFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setKindFilter('all')}>전체</Button>
            {EVIDENCE_KINDS.filter((kind) => presentKinds.has(kind)).map((kind) => (
              <Button key={kind} size="sm" variant={kindFilter === kind ? 'primary' : 'secondary'} onClick={() => setKindFilter(kind)}>{kind}</Button>
            ))}
          </div>
          <div className="grid gap-2">
            {rows.map((record) => <EvidenceRow key={record.id} record={record} />)}
            {rows.length === 0 && <p className="text-body text-muted">선택한 종류의 증거가 없습니다</p>}
          </div>
        </div>
      )}
    </Card>
  );
}

function EvidenceRow({ record }: { record: EvidenceRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-panel border border-border bg-bg p-3">
      <button
        type="button"
        className="flex w-full min-w-0 flex-wrap items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Badge tone={toneToBadge(kindTone(record.kind))}>{record.kind}</Badge>
        <CodeText>#{record.id}</CodeText>
        <span className="min-w-0 flex-1 truncate text-caption font-mono text-secondary">{trunc(record.summary, 96)}</span>
        {record.created_at && <span className="text-caption text-muted" title={fmtAbs(record.created_at)}>{timeAgo(record.created_at)}</span>}
        <span className="text-caption text-muted">{open ? '접기' : '펼치기'}</span>
      </button>
      <Collapsible open={open}>
        <div className="mt-3 grid gap-3 border-t border-border pt-3">
          {record.created_at && <p className="text-caption text-muted">수집 시각: {fmtAbs(record.created_at)}</p>}
          {record.evidence_ref && <CopyPill value={record.evidence_ref} display={trunc(record.evidence_ref, 30)} />}
          <div className="grid gap-2">
            {record.sources.map((source) => (
              <div key={`${record.id}-${source.source}`} className="flex min-w-0 flex-wrap items-center gap-2 rounded-control border border-border bg-raised px-3 py-2 text-caption">
                <Badge>{source.source}</Badge>
                <span className="min-w-0 flex-1 truncate text-secondary">{source.summary}</span>
                {source.collector_version && <CodeText>{trunc(source.collector_version, 18)}</CodeText>}
              </div>
            ))}
          </div>
        </div>
      </Collapsible>
    </article>
  );
}

function RcaReportsPanel({ correlationId, onShowEvidence }: { correlationId: string; onShowEvidence: () => void }) {
  const q = useRcaReports(correlationId || undefined);
  if (!correlationId) {
    return <Card title="RCA 리포트" empty={<EmptyState icon={<FileIcon />} title="correlation 없음" description="correlation id가 없어 리포트를 조회할 수 없습니다" />}><span /></Card>;
  }
  const reports = q.data ?? [];
  return (
    <Card title="RCA 리포트">
      {q.isPending ? (
        <Skeleton lines={4} />
      ) : q.isError ? (
        <EmptyState icon={<AlertIcon />} title="리포트 조회 실패" description={(q.error as Error).message} action={<Button size="sm" onClick={() => q.refetch()}>다시 시도</Button>} />
      ) : reports.length === 0 ? (
        <EmptyState icon={<FileIcon />} title="RCA 리포트 없음" description="생성된 RCA 리포트가 아직 없습니다" />
      ) : (
        <div className="grid gap-3">
          {reports.map((report) => <RcaReportCard key={report.id} report={report} onShowEvidence={onShowEvidence} />)}
        </div>
      )}
    </Card>
  );
}

function RcaReportCard({ report, onShowEvidence }: { report: RcaReportSummary; onShowEvidence: () => void }) {
  const severityTone: BadgeTone = report.severity === 'critical' || report.severity === 'high' ? 'danger'
    : report.severity === 'medium' ? 'warning' : report.severity ? 'info' : 'neutral';
  const candidates = report.candidates ?? [];
  const refs = report.supporting_evidence_refs ?? [];
  const missingChecks = (report.missing_evidence_checks ?? []).filter((check) => check.status !== 'collected');
  const target = [report.namespace, report.resource_kind, report.resource_name].filter(Boolean).join('/');
  return (
    <article className="grid gap-3 rounded-panel border border-border bg-bg p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {report.severity && <Badge tone={severityTone}>{report.severity}</Badge>}
        <StatusBadge status={report.action} />
        {report.confidence != null && <span className="text-caption text-secondary">신뢰도 <b>{(report.confidence * 100).toFixed(0)}%</b></span>}
        {report.created_at && <span className="ms-auto text-caption text-muted" title={fmtAbs(report.created_at)}>{timeAgo(report.created_at)}</span>}
      </div>
      <h3 className="text-title font-semibold text-primary">{report.root_cause}</h3>
      {target && <p className="text-caption text-secondary">대상: <CodeText>{target}</CodeText></p>}
      {report.symptom && (
        <div className="flex flex-wrap items-center gap-2 text-caption text-secondary">
          <span>증상: {report.symptom}</span>
          {(report.secondary_symptoms ?? []).map((symptom) => <Badge key={symptom}>{symptom}</Badge>)}
        </div>
      )}
      {report.reason && <p className="text-caption text-secondary">판단 근거: {report.reason}</p>}
      {candidates.length > 0 && <CandidateScores candidates={candidates} selectedId={report.selected_candidate_id ?? null} />}
      {refs.length > 0 ? <EvidenceRefList refs={refs} /> : <EvidenceFallbackChips items={report.supporting_evidence} tone="success" />}
      {missingChecks.length > 0 ? (
        <div className="grid gap-1">
          {missingChecks.map((check) => (
            <span key={check.check_id} className="text-caption text-warning">
              미수집 {check.source ? `[${check.source}] ` : ''}{check.check_id}{check.reason ? ` - ${check.reason}` : ''}
            </span>
          ))}
        </div>
      ) : (
        <EvidenceFallbackChips items={report.missing_evidence.map((item) => `미수집: ${item}`)} tone="warning" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onShowEvidence}>증거 흐름 보기</Button>
        {report.evidence_ref && <CodeText>{trunc(report.evidence_ref, 30)}</CodeText>}
        <CopyPill value={report.correlation_id} display={trunc(report.correlation_id, 16)} />
      </div>
    </article>
  );
}

function CandidateScores({ candidates, selectedId }: { candidates: RcaCandidateScore[]; selectedId: string | null }) {
  const [open, setOpen] = useState(false);
  const shown = open ? candidates : candidates.slice(0, 2);
  return (
    <section className="grid gap-2">
      <div className="text-caption text-muted">후보 평가 ({candidates.length})</div>
      {shown.map((candidate) => {
        const selected = candidate.candidate_id === selectedId;
        const score = candidate.score ?? 0;
        return (
          <div key={candidate.candidate_id} className={cx('grid gap-2 rounded-control border bg-raised p-3', selected ? 'border-success/50' : 'border-border')}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={selected ? 'text-label font-bold text-primary' : 'text-label font-medium text-secondary'}>
                {candidate.title ?? candidate.candidate_id}
              </span>
              {candidate.source === 'ai_fallback' && <Badge tone="info">AI</Badge>}
              {selected && <Badge tone="success">선정</Badge>}
              <span className="ms-auto inline-flex items-center gap-2">
                <ScoreBar score={score} />
                <b className="text-caption tabular-nums text-secondary">{score.toFixed(2)}</b>
              </span>
            </div>
            {(candidate.supporting_evidence.length > 0 || candidate.missing_evidence.length > 0) && (
              <div className="flex flex-wrap gap-2 text-caption">
                {candidate.supporting_evidence.map((item) => <span key={`s-${item}`} className="text-success">충족 {trunc(item, 36)}</span>)}
                {candidate.missing_evidence.map((item) => <span key={`m-${item}`} className="text-warning">미충족 {trunc(item, 36)}</span>)}
              </div>
            )}
          </div>
        );
      })}
      {candidates.length > 2 && (
        <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
          {open ? '접기' : `후보 ${candidates.length - 2}개 더 보기`}
        </Button>
      )}
    </section>
  );
}

function EvidenceRefList({ refs }: { refs: RcaEvidenceRef[] }) {
  return (
    <section className="grid gap-2">
      <div className="text-caption text-muted">판단에 사용된 근거 ({refs.length})</div>
      {refs.map((ref, index) => (
        <div key={`${ref.source}-${ref.name}-${index}`} className="grid gap-2 rounded-control border border-border bg-raised p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge tone={toneToBadge(kindTone(ref.source))}>{ref.source}</Badge>
            {ref.schema_version != null && <Badge>schema v{ref.schema_version}</Badge>}
            <span className="text-caption text-secondary">{ref.name}</span>
            {ref.summary && <span className="min-w-0 flex-1 truncate text-caption text-muted">{trunc(ref.summary, 60)}</span>}
          </div>
          {(ref.collector || ref.collector_version || ref.source_version || ref.query_version || ref.evidence_key || ref.source_id || ref.agent_id || ref.collected_at || ref.window_start) && (
            <div className="flex flex-wrap gap-2 text-caption text-muted">
              {ref.collector && <span>{ref.collector}</span>}
              {ref.collector_version && <CodeText>{trunc(ref.collector_version, 18)}</CodeText>}
              {ref.source_version && <span>{ref.source_version}</span>}
              {ref.query_version && <CodeText>{trunc(ref.query_version, 18)}</CodeText>}
              {ref.source_id && <span>{ref.source_id}</span>}
              {ref.agent_id && <CodeText>{trunc(ref.agent_id, 18)}</CodeText>}
              {ref.evidence_key && <CodeText>{trunc(ref.evidence_key, 28)}</CodeText>}
              {ref.window_start && <span>{trunc(ref.window_start, 24)}</span>}
              {ref.collected_at && <span title={fmtAbs(ref.collected_at)}>{fmtAbs(ref.collected_at)}</span>}
            </div>
          )}
          {ref.query && <CodeBlock code={ref.query} label={ref.check_id ?? '근거 쿼리'} />}
        </div>
      ))}
    </section>
  );
}

function EvidenceFallbackChips({ items, tone }: { items: string[]; tone: BadgeTone }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => <Badge key={`${item}-${index}`} tone={tone}>{trunc(item, 40)}</Badge>)}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function statusMeta(status: string): { label: string; tone: BadgeTone } {
  const key = String(status || 'unknown').toLowerCase();
  if (['completed', 'done', 'resolved', 'closed', 'ok', 'success', 'selected', 'approved'].includes(key)) return { label: status || '완료', tone: 'success' };
  if (['open', 'running', 'analysis', 'evidence', 'info', 'progressing'].includes(key)) return { label: status || '진행', tone: 'info' };
  if (['pending', 'selection_requested', 'waiting', 'warn', 'warning'].includes(key)) return { label: status || '대기', tone: 'warning' };
  if (['failed', 'rejected', 'critical', 'danger', 'error'].includes(key)) return { label: status || '실패', tone: 'danger' };
  return { label: status || '미확인', tone: 'neutral' };
}

function toneOfStatus(status: string): Tone {
  return statusMeta(status).tone === 'success' ? 'ok'
    : statusMeta(status).tone === 'warning' ? 'warn'
      : statusMeta(status).tone === 'danger' ? 'danger'
        : statusMeta(status).tone === 'info' ? 'info'
          : 'neutral';
}

function toneToBadge(tone: Tone): BadgeTone {
  if (tone === 'ok') return 'success';
  if (tone === 'warn') return 'warning';
  if (tone === 'danger') return 'danger';
  if (tone === 'info') return 'info';
  return 'neutral';
}

function flowToneClass(tone: Tone) {
  return {
    ok: 'border-success/50',
    warn: 'border-warning/50',
    danger: 'border-danger/50',
    info: 'border-info/50',
    neutral: 'border-border',
  }[tone];
}

function ScoreBar({ score }: { score: number }) {
  const width = score >= 0.9 ? 'w-full' : score >= 0.75 ? 'w-4/5' : score >= 0.5 ? 'w-3/5' : score >= 0.25 ? 'w-2/5' : 'w-1/5';
  const tone = score >= 0.9 ? 'bg-success' : score >= 0.5 ? 'bg-warning' : 'bg-muted';
  return (
    <span className="inline-flex h-1.5 w-16 overflow-hidden rounded-full bg-surface">
      <span className={cx('h-full rounded-full', width, tone)} />
    </span>
  );
}

function CopyPill({ value, display }: { value: string; display?: string }) {
  const { push } = useToast();
  const copy = () => {
    navigator.clipboard.writeText(value)
      .then(() => push({ tone: 'success', title: '복사 완료', description: '값을 클립보드에 복사했습니다' }))
      .catch(() => push({ tone: 'danger', title: '복사 실패', description: '브라우저 권한을 확인해주세요' }));
  };
  return <Button size="sm" variant="secondary" onClick={copy}>{display ?? value}</Button>;
}

function CodeText({ children }: { children: ReactNode }) {
  return <code className="inline-flex max-w-full truncate rounded-control border border-border bg-raised px-2 py-1 font-mono text-caption text-secondary">{children}</code>;
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M8 2.5 14 13H2zM8 6v3M8 11.5h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M4 2.5h5L12.5 6v7.5H4zM9 2.8V6h3.2" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}
