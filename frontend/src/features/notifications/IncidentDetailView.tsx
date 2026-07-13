// RCA 인시던트 파이프라인 그래프 + 저장된 증거/RCA 리포트 실데이터 패널.
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon, ClipboardIcon, FileTextIcon, LoaderCircleIcon, TriangleAlertIcon } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvidence, useIncident, useRcaReports, useRecoveryPlan } from '@/features/notifications/api';
import { useCreateConversation } from '@/features/chat/api';
import { cn } from '@/lib/utils';
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
import { toast } from 'sonner';

const STAGES = ['incident', 'evidence', 'analysis', 'actions'] as const;
type Stage = typeof STAGES[number];
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type FlowEdge = Edge<FlowEdgeData>;

const STAGE_LABEL: Record<Stage, string> = { incident: '인시던트', evidence: '증거 수집', analysis: '원인 분석', actions: '복구 조치' };
const TERMINAL = new Set(['completed', 'done', 'resolved', 'closed', 'failed', 'rejected']);
const EVIDENCE_KINDS = ['kubernetes', 'prometheus', 'loki', 'tempo'] as const;
const KIND_TONE: Record<string, Tone> = { kubernetes: 'info', prometheus: 'warn', loki: 'ok', tempo: 'neutral' };
const ROOT_CAUSE_LABEL: Record<string, string> = {
  oom_killed: '메모리 한도 초과로 컨테이너 재시작',
  bad_image_rollout: '배포 이미지 문제',
  config_env_error: '설정 또는 환경변수 오류',
  app_startup_failure: '애플리케이션 시작 실패',
  dependency_connection_failure: '의존성 연결 실패',
  application_5xx_spike: '애플리케이션 5xx/timeout 급증',
  backend_readiness_failure: '백엔드 readiness 실패',
  upstream_unavailable: '서비스 endpoint 연결 불가',
  wrong_image_tag: '잘못된 이미지 태그',
  missing_image_pull_secret: '이미지 pull Secret 누락',
  registry_unavailable: '이미지 registry 장애',
  insufficient_cpu: '노드 CPU 부족',
  insufficient_memory: '노드 메모리 부족',
  node_affinity_or_taint_mismatch: '스케줄링 조건 불일치',
  pvc_pending: 'PVC 바인딩 대기',
  unknown: '원인 확인 필요',
};
const SYMPTOM_LABEL: Record<string, string> = {
  CrashLoopBackOff: '컨테이너 반복 재시작',
  ImagePullBackOff: '이미지 가져오기 실패',
  ErrImagePull: '이미지 가져오기 실패',
  FailedScheduling: '스케줄링 실패',
  Pending: '스케줄 대기',
  'Ingress 502/503': '사용자 요청 5xx 오류',
  'Ingress 502': '사용자 요청 502 오류',
  'Ingress 503': '사용자 요청 503 오류',
};
const ROUTE_LABEL: Record<string, string> = {
  auto: '자동 조치',
  safe_pr: 'Safe PR',
  approval_required: '승인 필요',
  forbidden: '정책 차단',
};
const SUBJECT_LABEL: Record<string, string> = {
  'incident.detected': '인시던트 감지',
  'evidence.bundle.built': '증거 정리',
  'rca.candidates.planned': '원인 후보 생성',
  'rca.candidates.evaluated': '원인 후보 평가',
  'rca.completed': 'RCA 완료',
  'rca.analysis_blocked': 'RCA 대기',
  'recovery.planned': '복구 계획 생성',
  'recovery.selection_requested': '복구 선택 대기',
  'recovery.action_selected': '복구 조치 선택',
  'command.requested': '명령 요청',
  'command.completed': '명령 완료',
  'safe_pr.created': 'Safe PR 생성',
};

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
    <div className={cn('min-w-40 rounded-panel border bg-surface px-4 py-3 text-center shadow-soft', flowToneClass(data.tone), data.active && 'flow-node--pulse')}>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <div className="text-body font-semibold text-text-primary">{data.label}</div>
      {data.sub && <div className="mt-1 max-w-52 truncate text-caption font-normal text-text-secondary">{data.sub}</div>}
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

function ItemNode({ data }: NodeProps<Node<{ label: string; tone: Tone }>>) {
  return (
    <div className={cn('max-w-64 rounded-control border bg-bg px-3 py-2 font-mono text-caption text-text-secondary shadow-soft', flowToneClass(data.tone))}>
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
    data: { label: STAGE_LABEL.incident, sub: trunc(incidentTitle(incident)), tone: stageTone(0), active: running && current === 0 },
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
      sub: incident.root_cause ? `${trunc(rootCauseLabel(incident.root_cause))}${confidence ? ` · ${confidence}` : ''}` : confidence,
      tone: stageTone(2),
      active: running && current === 2,
    },
  });

  const actions = [
    ...(incident.action_route ? [{ id: 'act-route', label: `경로: ${trunc(routeLabel(incident.action_route))}`, tone: 'info' as Tone }] : []),
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
  const nav = useNavigate();
  const q = useIncident(incidentId);
  const pathFor = useConsolePath();
  const askAi = useCreateConversation();
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
        <IncidentHeading
          title="인시던트 타임라인 상세를 찾을 수 없습니다"
          description="파이프라인 상태 행이 정리됐을 수 있습니다. 아래는 동일 correlation으로 저장된 RCA 리포트와 증거입니다"
          incidentId={incidentId}
          incidentsPath={pathFor('/incidents')}
          actions={<CopyPill value={incidentId} display={trunc(incidentId, 22)} />}
        />
        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
            <CardContent>
              <RecoveryPlanPanel correlationId={incidentId} standalone />
            </CardContent>
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
      <div className="grid gap-6" role="status" aria-live="polite" aria-label="인시던트 상세 불러오는 중">
        <IncidentHeading title="인시던트" incidentId={incidentId} incidentsPath={pathFor('/incidents')} />
        <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
          <CardContent><LoadingLines lines={6} /></CardContent>
        </Card>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="grid gap-6">
        <IncidentHeading title="인시던트 조회 실패" incidentId={incidentId} incidentsPath={pathFor('/incidents')} />
        <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
          <CardContent>
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertTitle>인시던트 조회 실패</AlertTitle>
              <AlertDescription>{(q.error as Error).message}</AlertDescription>
              <AlertAction className="static col-start-2 mt-3 justify-self-start">
                <Button type="button" variant="outline" onClick={() => void q.refetch()}>다시 시도</Button>
              </AlertAction>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const incident = q.data;
  if (!incident) {
    return (
      <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
        <CardContent>
          <StateMessage title="인시던트 없음" description="표시할 인시던트 상세가 없습니다" />
        </CardContent>
      </Card>
    );
  }
  const aiContext = incidentChatContext(incident);
  const startAiAnalysis = () => {
    askAi.mutate({
      title: `인시던트 분석 - ${incidentTitle(incident)}`,
      message: [
        '이 인시던트의 현재 상태, 근본 원인, 증거, 가능한 복구 조치를 한국어로 요약해줘.',
        '복구 후보가 있으면 어떤 조치를 먼저 선택해야 하는지도 운영 관점으로 설명해줘.',
      ].join(' '),
      context: aiContext,
    }, {
      onSuccess: (data) => nav(pathFor(`/ai/${data.conversation_id}`)),
    });
  };

  return (
    <div className="grid gap-6">
      <IncidentHeading
        title={incidentTitle(incident)}
        description={`${labelForSubject(incident.current_subject)} · ${incident.updated_at ? fmtAbs(incident.updated_at) : '갱신 시각 없음'}`}
        incidentId={incidentId}
        incidentsPath={pathFor('/incidents')}
        actions={(
          <span className="inline-flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={startAiAnalysis} disabled={askAi.isPending} aria-busy={askAi.isPending}>
              {askAi.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
              AI 분석
            </Button>
            {incident.correlation_id && <CopyPill value={incident.correlation_id} display={`corr ${trunc(incident.correlation_id, 22)}`} />}
          </span>
        )}
      />
      <IncidentSituationCard incident={incident} onAskAi={startAiAnalysis} aiPending={askAi.isPending} />
      <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
        <CardContent>
          <RecoveryPlanPanel correlationId={incident.correlation_id} standalone />
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0 xl:col-span-2">
          <CardHeader className="border-b border-border">
            <CardTitle><h2 className="text-title font-semibold text-text-primary">RCA 파이프라인</h2></CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="max-w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              role="region"
              aria-label="RCA 파이프라인 그래프"
              tabIndex={0}
            >
              <div className="h-96 min-w-2xl overflow-hidden rounded-panel border border-border bg-bg">
                <FlowCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
          <CardHeader className="border-b border-border">
            <CardTitle><h2 className="text-title font-semibold text-text-primary">상세</h2></CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <DefinitionList items={[
              { label: '상태', value: <StatusBadge status={incident.status} /> },
              { label: '클러스터', value: incident.cluster_id ? <Link className="text-brand hover:text-brand-hover" to={pathFor(`/clusters/${incident.cluster_id}`)}>{incident.cluster_id}</Link> : '없음' },
              { label: '대상', value: incidentTarget(incident) || '확인 중' },
              { label: '현재 단계', value: labelForSubject(incident.current_subject) },
              { label: '근본 원인', value: incident.root_cause ? rootCauseLabel(incident.root_cause) : '분석 중' },
              { label: '신뢰도', value: incident.confidence != null ? `${(incident.confidence * 100).toFixed(0)}%` : '없음' },
              { label: 'correlation', value: incident.correlation_id ? <CopyPill value={incident.correlation_id} display={trunc(incident.correlation_id, 18)} /> : '없음' },
              { label: '커맨드', value: incident.command_id ? <CodeText>{trunc(incident.command_id, 18)}</CodeText> : '없음' },
              { label: 'PR', value: incident.pr_url ? <a className="text-brand hover:text-brand-hover" href={incident.pr_url} target="_blank" rel="noopener noreferrer">{trunc(incident.pr_url, 28)}</a> : '없음' },
              { label: '갱신', value: incident.updated_at ? <time dateTime={incident.updated_at} title={fmtAbs(incident.updated_at)}>{timeAgo(incident.updated_at)} · {fmtAbs(incident.updated_at)}</time> : '없음' },
            ]} />
            {incident.error_reason && <p className="text-caption font-medium text-danger">실패 사유: {incident.error_reason}</p>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <RcaReportsPanel correlationId={incident.correlation_id} onShowEvidence={showEvidence} />
        <div ref={evidenceRef}><EvidencePanel correlationId={incident.correlation_id} incident={incident} /></div>
      </section>
    </div>
  );
}

function IncidentHeading({
  title,
  description,
  incidentId,
  incidentsPath,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  incidentId: string;
  incidentsPath: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid min-w-0 gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to={incidentsPath} />}>인시던트</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{`인시던트 ${incidentId}`}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-page font-semibold text-text-primary">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-body text-text-secondary">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

function IncidentSituationCard({ incident, onAskAi, aiPending }: { incident: IncidentDetail; onAskAi: () => void; aiPending: boolean }) {
  const symptom = incident.symptom ? symptomLabel(incident.symptom) : '증상 확인 중';
  const cause = incident.root_cause ? rootCauseLabel(incident.root_cause) : '원인 분석 중';
  const target = incidentTarget(incident) || '대상 확인 중';
  const confidence = incident.confidence != null ? `${(incident.confidence * 100).toFixed(0)}%` : '계산 중';
  const nextAction = incident.action_route ? routeLabel(incident.action_route) : '복구 계획 대기';
  return (
    <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
      <CardHeader className="border-b border-border">
        <CardTitle><h2 className="text-title font-semibold text-text-primary">상황 요약</h2></CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="grid gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge status={incident.status} />
            <Badge variant="outline" className={toneBadgeClass('info')}>{symptom}</Badge>
            {incident.root_cause && <Badge variant="outline" className={toneBadgeClass('warning')}>{cause}</Badge>}
          </div>
          <p className="text-title font-semibold text-text-primary">
            {target}에서 {symptom} 신호가 감지됐고, 현재 {cause} 상태입니다.
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            <SummaryMetric label="대상" value={target} />
            <SummaryMetric label="신뢰도" value={confidence} />
            <SummaryMetric label="다음 조치" value={nextAction} />
          </div>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onAskAi} disabled={aiPending} aria-busy={aiPending}>
          {aiPending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
          AI에 묻기
        </Button>
      </CardContent>
    </Card>
  );
}

function SummaryMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-control border border-border bg-raised px-3 py-2">
      <p className="text-caption font-medium text-text-muted">{label}</p>
      <p className="mt-1 min-w-0 truncate text-body font-semibold text-text-primary">{value}</p>
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
        <h2 className="text-title font-semibold text-text-primary">복구 계획</h2>
        {plan && <Badge variant="outline" className={toneBadgeClass(toneToBadge(recoveryPlanTone(plan)))}>{plan.status}</Badge>}
      </div>
      {q.isPending ? (
        <LoadingLines lines={2} />
      ) : missing ? (
        <Badge variant="secondary">생성 전</Badge>
      ) : q.isError ? (
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>복구 계획 조회 실패</AlertTitle>
          <AlertDescription>{(q.error as Error).message}</AlertDescription>
          <AlertAction className="static col-start-2 mt-3 justify-self-start">
            <Button type="button" size="sm" variant="outline" onClick={() => void q.refetch()}>다시 시도</Button>
          </AlertAction>
        </Alert>
      ) : plan ? (
        <RecoveryPlanSummary plan={plan} />
      ) : (
        <StateMessage title="복구 계획 없음" />
      )}
    </section>
  );
}

function RecoveryPlanSummary({ plan }: { plan: RecoveryPlanStatus }) {
  const selected = plan.selected_action;
  const recommended = plan.candidates.find((candidate) => candidate.action_id === plan.recommended_action_id) ?? null;
  const visible = [
    ...(selected ? [selected] : []),
    ...plan.candidates.filter((candidate) => candidate.action_id !== selected?.action_id),
  ];
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 xl:grid-cols-3">
        <div className="grid gap-2 xl:col-span-2">
          <p className="text-body font-semibold text-text-primary">{plan.summary}</p>
          <p className="text-caption text-text-secondary">{recoveryTargetLabel(plan)}</p>
        </div>
        <DefinitionList items={[
          { label: '경로', value: routeLabel(plan.execution_route) },
          { label: '추천', value: recommended ? recommended.title : plan.recommended_action_id },
          { label: '상태', value: selected ? `${selected.title} 선택됨` : plan.selection_required ? '조치 선택 대기' : '선택 불필요' },
        ]} />
      </div>
      <div className="grid gap-2 rounded-control border border-border bg-bg p-3 md:grid-cols-4">
        {recoveryFlowSteps(plan).map((step) => (
          <div key={step.label} className="flex min-w-0 items-center gap-2">
            <span className={cn('size-2 shrink-0 rounded-full', step.tone === 'ok' ? 'bg-success' : step.tone === 'warn' ? 'bg-warning' : step.tone === 'danger' ? 'bg-danger' : step.tone === 'info' ? 'bg-info' : 'bg-text-muted')} />
            <div className="min-w-0">
              <p className="truncate text-label font-semibold text-text-primary">{step.label}</p>
              <p className="truncate text-caption text-text-muted">{step.value}</p>
            </div>
          </div>
        ))}
      </div>
      <DefinitionList items={[
        { label: '후보', value: `${plan.candidates.length.toLocaleString()}개` },
        { label: '승인', value: visible.some((candidate) => candidate.approval_required) ? '승인 필요 후보 있음' : '승인 불필요 후보만 있음' },
        { label: '검증 항목', value: selected ? selected.validation_checks.join(', ') || '없음' : '선택 정보 없음' },
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
      {plan.selected_by && <span className="text-caption text-text-muted">선택자: <CodeText>{plan.selected_by}</CodeText></span>}
    </div>
  );
}

function recoveryFlowSteps(plan: RecoveryPlanStatus): Array<{ label: string; value: string; tone: Tone }> {
  const selected = plan.selected_action;
  return [
    { label: '감지', value: '인시던트 생성', tone: 'ok' },
    { label: '분석', value: plan.summary ? '원인 산출' : '진행 중', tone: plan.summary ? 'ok' : 'neutral' },
    {
      label: '조치',
      value: selected ? selected.title : plan.selection_required ? '선택 대기' : '선택 불필요',
      tone: selected ? 'ok' : plan.selection_required ? 'warn' : 'neutral',
    },
    {
      label: '후속 처리',
      value: '상태 미제공',
      tone: 'neutral',
    },
  ];
}

function recoveryTargetLabel(plan: RecoveryPlanStatus): string {
  const kind = String(plan.target.resource_kind ?? plan.target.kind ?? '');
  const name = String(plan.target.resource_name ?? plan.target.name ?? '');
  const namespace = String(plan.target.namespace ?? '');
  const cluster = String(plan.target.cluster_id ?? '');
  return [cluster, namespace, kind && name ? `${kind}/${name}` : name || kind]
    .filter(Boolean)
    .join(' · ') || '대상 정보 없음';
}

function RecoveryCandidateRow({
  candidate,
  recommended,
  selected,
}: {
  candidate: RecoveryActionCandidate;
  recommended: boolean;
  selected: boolean;
}) {
  return (
    <div className={cn('grid gap-2 rounded-control border bg-raised p-3', selected ? 'border-success/50' : recommended ? 'border-info/50' : 'border-border')}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-label font-semibold text-text-primary">{candidate.title}</span>
        {selected && <Badge variant="outline" className={toneBadgeClass('success')}>선택</Badge>}
        {recommended && !selected && <Badge variant="outline" className={toneBadgeClass('info')}>추천</Badge>}
        {candidate.approval_required && <Badge variant="outline" className={toneBadgeClass('warning')}>승인 필요</Badge>}
        <span className="ms-auto text-caption text-text-muted">{routeLabel(candidate.route)}</span>
      </div>
      <p className="text-caption text-text-muted">
        {candidate.description} · 위험 {riskLabel(candidate.risk_level)} · 영향 {blastRadiusLabel(candidate.blast_radius)}
      </p>
      {candidate.rollback_plan && <p className="text-caption text-text-secondary">롤백: {candidate.rollback_plan}</p>}
    </div>
  );
}

function recoveryPlanTone(plan: RecoveryPlanStatus): Tone {
  if (plan.status === 'selected') return 'ok';
  if (plan.status === 'selection_requested') return 'warn';
  return plan.selection_required ? 'info' : 'neutral';
}

function EvidencePanel({ correlationId, incident }: { correlationId: string; incident?: IncidentDetail }) {
  const q = useEvidence(correlationId || undefined);
  const [kindFilter, setKindFilter] = useState('all');
  if (!correlationId) {
    return (
      <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
        <CardHeader className="border-b border-border"><CardTitle><h2 className="text-title font-semibold text-text-primary">증거</h2></CardTitle></CardHeader>
        <CardContent><StateMessage icon={<FileIcon />} title="correlation 없음" description="correlation id가 없어 증거를 조회할 수 없습니다" /></CardContent>
      </Card>
    );
  }
  const items = q.data?.items ?? [];
  const presentKinds = new Set(items.map((item) => item.kind));
  const unknownKinds = [...presentKinds]
    .filter((kind) => !EVIDENCE_KINDS.includes(kind as (typeof EVIDENCE_KINDS)[number]))
    .sort((left, right) => left.localeCompare(right));
  const kindOptions = [
    ...EVIDENCE_KINDS.filter((kind) => presentKinds.has(kind)),
    ...unknownKinds,
  ];
  const rows = items.filter((item) => kindFilter === 'all' || item.kind === kindFilter);
  const title = q.data ? `증거 ${items.length.toLocaleString()}건${q.data.has_more ? ' · 최근 100건' : ''}` : '증거';
  const collecting = items.length === 0 && isEvidenceCollecting(incident);
  const missingPreview = incident?.missing_evidence.slice(0, 3) ?? [];
  return (
    <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
      <CardHeader className="border-b border-border">
        <CardTitle><h2 className="text-title font-semibold text-text-primary">{title}</h2></CardTitle>
      </CardHeader>
      <CardContent>
        {q.isPending ? (
          <LoadingLines lines={4} />
        ) : q.isError ? (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>증거 조회 실패</AlertTitle>
            <AlertDescription>{(q.error as Error).message}</AlertDescription>
            <AlertAction className="static col-start-2 mt-3 justify-self-start"><Button type="button" size="sm" variant="outline" onClick={() => void q.refetch()}>다시 시도</Button></AlertAction>
          </Alert>
        ) : collecting ? (
          <StateMessage
            icon={<FileIcon />}
            title="증거 수집 중"
            description={(
              <span className="grid gap-2">
                <span>수집 워커가 이 correlation의 증거를 아직 저장하지 않았습니다. 보통 수십 초 안에 갱신됩니다.</span>
                {missingPreview.length > 0 && (
                  <span className="flex flex-wrap justify-center gap-2">
                    {missingPreview.map((item) => <Badge key={item} variant="outline" className={toneBadgeClass('warning')}>미수집 {trunc(item, 28)}</Badge>)}
                  </span>
                )}
              </span>
            )}
            action={(
              <Button type="button" size="sm" variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching} aria-busy={q.isFetching}>
                {q.isFetching && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
                다시 확인
              </Button>
            )}
          />
        ) : items.length === 0 ? (
          <StateMessage icon={<FileIcon />} title="증거 없음" description="수집이 완료됐지만 이 correlation에 저장된 증거가 없습니다" />
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="증거 종류 필터">
              <Button type="button" size="sm" variant={kindFilter === 'all' ? 'default' : 'outline'} aria-pressed={kindFilter === 'all'} onClick={() => setKindFilter('all')}>전체</Button>
              {kindOptions.map((kind) => (
                <Button type="button" key={kind} size="sm" variant={kindFilter === kind ? 'default' : 'outline'} aria-pressed={kindFilter === kind} onClick={() => setKindFilter(kind)}>{kind}</Button>
              ))}
            </div>
            <div className="grid gap-2">
              {rows.map((record) => <EvidenceRow key={record.id} record={record} />)}
              {rows.length === 0 && (
                <StateMessage
                  icon={<FileIcon />}
                  title="선택한 증거 없음"
                  description="선택한 종류의 증거가 없습니다"
                  action={<Button type="button" size="sm" variant="outline" onClick={() => setKindFilter('all')}>필터 초기화</Button>}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function isEvidenceCollecting(incident?: IncidentDetail) {
  if (!incident) return false;
  const status = incident.status.toLowerCase();
  if (TERMINAL.has(status)) return false;
  const stage = stageOfSubject(incident.current_subject);
  return stage === 'evidence' || incident.missing_evidence.length > 0 || (stage !== 'actions' && incident.supporting_evidence.length === 0);
}

function EvidenceRow({ record }: { record: EvidenceRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <article className="rounded-panel border border-border bg-bg p-3">
        <CollapsibleTrigger render={<Button type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal px-0 py-0 text-left" />}>
          <Badge variant="outline" className={toneBadgeClass(toneToBadge(kindTone(record.kind)))}>{record.kind}</Badge>
          <CodeText>#{record.id}</CodeText>
          <span className="min-w-0 flex-1 truncate text-caption font-mono text-text-secondary">{trunc(record.summary, 96)}</span>
          {record.created_at && <time dateTime={record.created_at} className="text-caption text-text-muted" title={fmtAbs(record.created_at)}>{timeAgo(record.created_at)}</time>}
          <span className="sr-only">{open ? '접기' : '펼치기'}</span>
          <ChevronDownIcon className={cn('text-text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden">
          <div className="mt-3 grid gap-3 border-t border-border pt-3">
            {record.created_at && <p className="text-caption text-text-muted">수집 시각: <time dateTime={record.created_at}>{fmtAbs(record.created_at)}</time></p>}
            {record.evidence_ref && <CopyPill value={record.evidence_ref} display={trunc(record.evidence_ref, 30)} />}
            <div className="grid gap-2">
              {record.sources.map((source) => (
                <div key={`${record.id}-${source.source}`} className="flex min-w-0 flex-wrap items-center gap-2 rounded-control border border-border bg-raised px-3 py-2 text-caption">
                  <Badge variant="secondary">{source.source}</Badge>
                  <span className="min-w-0 flex-1 truncate text-text-secondary">{source.summary}</span>
                  {source.collector_version && <CodeText>{trunc(source.collector_version, 18)}</CodeText>}
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </article>
    </Collapsible>
  );
}

function RcaReportsPanel({ correlationId, onShowEvidence }: { correlationId: string; onShowEvidence: () => void }) {
  const q = useRcaReports(correlationId || undefined);
  if (!correlationId) {
    return (
      <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
        <CardHeader className="border-b border-border"><CardTitle><h2 className="text-title font-semibold text-text-primary">RCA 리포트</h2></CardTitle></CardHeader>
        <CardContent><StateMessage icon={<FileIcon />} title="correlation 없음" description="correlation id가 없어 리포트를 조회할 수 없습니다" /></CardContent>
      </Card>
    );
  }
  const reports = q.data ?? [];
  return (
    <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
      <CardHeader className="border-b border-border"><CardTitle><h2 className="text-title font-semibold text-text-primary">RCA 리포트</h2></CardTitle></CardHeader>
      <CardContent>
        {q.isPending ? (
          <LoadingLines lines={4} />
        ) : q.isError ? (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>리포트 조회 실패</AlertTitle>
            <AlertDescription>{(q.error as Error).message}</AlertDescription>
            <AlertAction className="static col-start-2 mt-3 justify-self-start"><Button type="button" size="sm" variant="outline" onClick={() => void q.refetch()}>다시 시도</Button></AlertAction>
          </Alert>
        ) : reports.length === 0 ? (
          <StateMessage icon={<FileIcon />} title="RCA 리포트 없음" description="생성된 RCA 리포트가 아직 없습니다" />
        ) : (
          <div className="grid gap-3">
            {reports.map((report) => <RcaReportCard key={report.id} report={report} onShowEvidence={onShowEvidence} />)}
          </div>
        )}
      </CardContent>
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
        {report.severity && <Badge variant="outline" className={toneBadgeClass(severityTone)}>{report.severity}</Badge>}
        <StatusBadge status={report.action} />
        {report.confidence != null && <span className="text-caption text-text-secondary">신뢰도 <b>{(report.confidence * 100).toFixed(0)}%</b></span>}
        {report.created_at && <time dateTime={report.created_at} className="ms-auto text-caption text-text-muted" title={fmtAbs(report.created_at)}>{timeAgo(report.created_at)}</time>}
      </div>
      <h3 className="text-title font-semibold text-text-primary">{report.root_cause}</h3>
      {target && <p className="text-caption text-text-secondary">대상: <CodeText>{target}</CodeText></p>}
      {report.symptom && (
        <div className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
          <span>증상: {report.symptom}</span>
          {(report.secondary_symptoms ?? []).map((symptom) => <Badge key={symptom}>{symptom}</Badge>)}
        </div>
      )}
      {report.reason && <p className="text-caption text-text-secondary">판단 근거: {report.reason}</p>}
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
        <Button type="button" size="sm" onClick={onShowEvidence}>증거 흐름 보기</Button>
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
      <div className="text-caption text-text-muted">후보 평가 ({candidates.length})</div>
      {shown.map((candidate) => {
        const selected = candidate.candidate_id === selectedId;
        const score = candidate.score;
        return (
          <div key={candidate.candidate_id} className={cn('grid gap-2 rounded-control border bg-raised p-3', selected ? 'border-success/50' : 'border-border')}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={selected ? 'text-label font-bold text-text-primary' : 'text-label font-medium text-text-secondary'}>
                {candidate.title ?? candidate.candidate_id}
              </span>
              {candidate.source === 'ai_fallback' && <Badge variant="outline" className={toneBadgeClass('info')}>AI</Badge>}
              {selected && <Badge variant="outline" className={toneBadgeClass('success')}>선정</Badge>}
              {score != null ? (
                <span className="ms-auto inline-flex items-center gap-2">
                  <ScoreBar score={score} />
                  <b className="text-caption tabular-nums text-text-secondary">{score.toFixed(2)}</b>
                </span>
              ) : (
                <span className="ms-auto text-caption text-text-muted" aria-label="점수 없음">—</span>
              )}
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
        <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? '접기' : `후보 ${candidates.length - 2}개 더 보기`}
        </Button>
      )}
    </section>
  );
}

function EvidenceRefList({ refs }: { refs: RcaEvidenceRef[] }) {
  return (
    <section className="grid gap-2">
      <div className="text-caption text-text-muted">판단에 사용된 근거 ({refs.length})</div>
      {refs.map((ref, index) => (
        <div key={`${ref.source}-${ref.name}-${index}`} className="grid gap-2 rounded-control border border-border bg-raised p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className={toneBadgeClass(toneToBadge(kindTone(ref.source)))}>{ref.source}</Badge>
            {ref.schema_version != null && <Badge variant="secondary">schema v{ref.schema_version}</Badge>}
            <span className="text-caption text-text-secondary">{ref.name}</span>
            {ref.summary && <span className="min-w-0 flex-1 truncate text-caption text-text-muted">{trunc(ref.summary, 60)}</span>}
          </div>
          {(ref.collector || ref.collector_version || ref.source_version || ref.query_version || ref.evidence_key || ref.source_id || ref.agent_id || ref.collected_at || ref.window_start) && (
            <div className="flex flex-wrap gap-2 text-caption text-text-muted">
              {ref.collector && <span>{ref.collector}</span>}
              {ref.collector_version && <CodeText>{trunc(ref.collector_version, 18)}</CodeText>}
              {ref.source_version && <span>{ref.source_version}</span>}
              {ref.query_version && <CodeText>{trunc(ref.query_version, 18)}</CodeText>}
              {ref.source_id && <span>{ref.source_id}</span>}
              {ref.agent_id && <CodeText>{trunc(ref.agent_id, 18)}</CodeText>}
              {ref.evidence_key && <CodeText>{trunc(ref.evidence_key, 28)}</CodeText>}
              {ref.window_start && <time dateTime={ref.window_start}>{trunc(ref.window_start, 24)}</time>}
              {ref.collected_at && <time dateTime={ref.collected_at} title={fmtAbs(ref.collected_at)}>{fmtAbs(ref.collected_at)}</time>}
            </div>
          )}
          {ref.query && <QueryBlock code={ref.query} label={ref.check_id ?? '근거 쿼리'} />}
        </div>
      ))}
    </section>
  );
}

function EvidenceFallbackChips({ items, tone }: { items: string[]; tone: BadgeTone }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => <Badge key={`${item}-${index}`} variant="outline" className={toneBadgeClass(tone)}>{trunc(item, 40)}</Badge>)}
    </div>
  );
}

function incidentTitle(incident: IncidentDetail) {
  const target = incidentTarget(incident);
  const symptom = incident.symptom ? symptomLabel(incident.symptom) : '';
  const cause = incident.root_cause ? rootCauseLabel(incident.root_cause) : '';
  if (target && symptom) return `${target} · ${symptom}`;
  if (cause) return cause;
  return incident.summary || '인시던트';
}

function incidentTarget(incident: IncidentDetail) {
  return [incident.namespace, kindLabel(incident.resource_kind), incident.resource_name]
    .filter(Boolean)
    .join(' ');
}

function incidentChatContext(incident: IncidentDetail) {
  return {
    cluster_id: incident.cluster_id,
    resource_type: (incident.resource_kind ?? '').toLowerCase(),
    kind: incident.resource_kind ?? undefined,
    namespace: incident.namespace ?? undefined,
    name: incident.resource_name ?? undefined,
    incident_id: incident.incident_id,
    correlation_id: incident.correlation_id,
    symptom: incident.symptom ?? undefined,
    root_cause: incident.root_cause ?? undefined,
    locale: 'ko',
  };
}

function labelFromMap(value: string | null | undefined, map: Record<string, string>) {
  if (!value) return '';
  return map[value] ?? map[value.toLowerCase()] ?? value;
}

function rootCauseLabel(value: string) {
  return labelFromMap(value, ROOT_CAUSE_LABEL);
}

function symptomLabel(value: string) {
  return labelFromMap(value, SYMPTOM_LABEL);
}

function routeLabel(value: string | null | undefined) {
  return labelFromMap(value, ROUTE_LABEL) || '대기';
}

function labelForSubject(value: string) {
  return labelFromMap(value, SUBJECT_LABEL) || STAGE_LABEL[stageOfSubject(value)];
}

function kindLabel(value: string | null | undefined) {
  if (!value) return '';
  const key = value.toLowerCase();
  if (key === 'deployment') return 'Deployment';
  if (key === 'replicaset') return 'ReplicaSet';
  if (key === 'pod') return 'Pod';
  if (key === 'service') return 'Service';
  if (key === 'node') return 'Node';
  return value;
}

function riskLabel(value: string) {
  const key = value.toLowerCase();
  if (key === 'low') return '낮음';
  if (key === 'medium') return '중간';
  if (key === 'high') return '높음';
  if (key === 'unknown') return '확인 필요';
  return value;
}

function blastRadiusLabel(value: string) {
  const key = value.toLowerCase();
  if (key === 'target_workload') return '대상 워크로드';
  if (key === 'target_namespace') return '대상 네임스페이스';
  if (key === 'unknown') return '확인 필요';
  return value;
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  return <Badge variant="outline" className={toneBadgeClass(meta.tone)}>{meta.label}</Badge>;
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

function toneBadgeClass(tone: BadgeTone) {
  return {
    success: 'border-success/40 bg-success/10 text-success',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    danger: 'border-danger/40 bg-danger/10 text-danger',
    info: 'border-info/40 bg-info/10 text-info',
    neutral: 'border-border bg-raised text-text-muted',
  }[tone];
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
  const tone = score >= 0.9 ? 'bg-success' : score >= 0.5 ? 'bg-warning' : 'bg-text-muted';
  return (
    <span className="inline-flex h-1.5 w-16 overflow-hidden rounded-full bg-surface">
      <span className={cn('h-full rounded-full', width, tone)} />
    </span>
  );
}

function CopyPill({ value, display }: { value: string; display?: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value)
      .then(() => toast.success('복사 완료', { description: '값을 클립보드에 복사했습니다' }))
      .catch(() => toast.error('복사 실패', { description: '브라우저 권한을 확인해주세요' }));
  };
  return <Button type="button" size="sm" variant="secondary" onClick={copy} aria-label={`${display ?? value} 복사`}>{display ?? value}</Button>;
}

function CodeText({ children }: { children: ReactNode }) {
  return <code className="inline-flex max-w-full truncate rounded-control border border-border bg-raised px-2 py-1 font-mono text-caption text-text-secondary">{children}</code>;
}

function FileIcon() {
  return <FileTextIcon className="size-5" aria-hidden="true" />;
}

function LoadingLines({ lines }: { lines: number }) {
  const widths = ['w-full', 'w-11/12', 'w-10/12', 'w-4/5'];
  return (
    <div className="grid gap-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-4', widths[index % widths.length])} />
      ))}
    </div>
  );
}

function StateMessage({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="grid min-h-32 place-items-center rounded-panel border border-dashed border-border bg-bg p-6 text-center" role="status" aria-live="polite">
      <div className="grid max-w-md justify-items-center gap-3">
        {icon && <span className="grid size-10 place-items-center rounded-panel border border-border bg-surface text-text-muted">{icon}</span>}
        <div className="grid gap-1">
          <h3 className="text-title font-semibold text-text-primary">{title}</h3>
          {description && <p className="text-body text-text-secondary">{description}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

function DefinitionList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 text-body sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="min-w-0 truncate text-text-muted">{item.label}</dt>
          <dd className="min-w-0 break-words text-text-secondary sm:col-span-2">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function QueryBlock({ code, label }: { code: string; label: string }) {
  const copy = () => {
    navigator.clipboard.writeText(code)
      .then(() => toast.success('복사 완료', { description: `${label}를 클립보드에 복사했습니다` }))
      .catch(() => toast.error('복사 실패', { description: '브라우저 권한을 확인해주세요' }));
  };
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-bg">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
        <span className="text-label font-semibold text-text-secondary">{label}</span>
        <Button type="button" size="icon-sm" variant="ghost" onClick={copy} aria-label={`${label} 복사`}>
          <ClipboardIcon aria-hidden="true" />
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto p-4 font-mono text-caption text-text-secondary"><code>{code}</code></pre>
    </div>
  );
}
