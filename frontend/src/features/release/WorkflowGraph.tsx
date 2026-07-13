import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CheckCircle2, Columns3, GitBranch, Rows3, Settings2, ShieldCheck } from 'lucide-react';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { FlowCanvas, useAutoLayout, type FlowDirection, type FlowEdgeData } from '@/shared/flow';
import type { Application, ReleasePlan, ReleasePlanStep, ReleaseRun } from '@/shared/lib/types';
import { cx } from '@/ui';
import {
  STRATEGIES,
  configString,
  optionLabel,
  releaseStatusLabel,
  releaseStatusTone,
  releaseWaves,
  runStepStatus,
  settingString,
  stepKey,
} from './model';

type WorkflowNodeKind = 'application' | 'approval' | 'preflight' | 'verification';

type WorkflowNodeData = {
  kind: WorkflowNodeKind;
  title: string;
  eyebrow: string;
  status: string;
  environment?: string;
  strategy?: string;
  cluster?: string;
  namespace?: string;
  selected: boolean;
  compact: boolean;
  showMetadata: boolean;
  direction: FlowDirection;
};

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowEdge = Edge<FlowEdgeData>;

export function WorkflowGraph({
  plan,
  applications,
  run,
  selectedStepId,
  onSelectStep,
  className,
  controls = true,
}: {
  plan: ReleasePlan;
  applications: Application[];
  run?: ReleaseRun;
  selectedStepId?: string;
  onSelectStep?: (stepId: string) => void;
  className?: string;
  controls?: boolean;
}) {
  const [direction, setDirection] = useState<FlowDirection>('LR');
  const [showCheckpoints, setShowCheckpoints] = useState(true);
  const [showMetadata, setShowMetadata] = useState(true);
  const [compact, setCompact] = useState(false);
  const graph = useMemo(
    () => buildGraph(plan, applications, run, selectedStepId, { showCheckpoints, showMetadata, compact, direction }),
    [applications, compact, direction, plan, run, selectedStepId, showCheckpoints, showMetadata],
  );
  const layout = useAutoLayout(graph.nodes, graph.edges, direction);

  return (
    <section className={cx('workflow-graph', className)} aria-label="워크플로우 그래프">
      <div className="workflow-graph__bar">
        <div className="workflow-graph__heading">
          <GitBranch size={17} aria-hidden="true" />
          <span>배포 흐름</span>
          <span className="workflow-graph__count">{plan.steps.length}단계</span>
        </div>
        {controls && (
          <Popover.Root>
            <Popover.Trigger className="workflow-view-trigger" aria-label="보기 설정" title="보기 설정">
              <Settings2 size={16} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={8}
                collisionPadding={{ top: 16, right: 16, bottom: 16, left: 72 }}
                className="workflow-view-popover"
              >
                <div className="workflow-view-popover__head">
                  <strong>보기 설정</strong>
                  <span>그래프 표시만 변경됩니다</span>
                </div>
                <fieldset className="workflow-view-popover__group">
                  <legend>방향</legend>
                  <div className="workflow-segmented" role="group" aria-label="그래프 방향">
                    <button type="button" aria-pressed={direction === 'LR'} onClick={() => setDirection('LR')}>
                      <Columns3 size={15} /> 가로
                    </button>
                    <button type="button" aria-pressed={direction === 'TB'} onClick={() => setDirection('TB')}>
                      <Rows3 size={15} /> 세로
                    </button>
                  </div>
                </fieldset>
                <label className="workflow-view-toggle">
                  <span><strong>검증·승인 단계</strong><small>체크포인트 노드 표시</small></span>
                  <input type="checkbox" checked={showCheckpoints} onChange={(event) => setShowCheckpoints(event.target.checked)} />
                </label>
                <label className="workflow-view-toggle">
                  <span><strong>대상 정보</strong><small>환경·클러스터·전략 표시</small></span>
                  <input type="checkbox" checked={showMetadata} onChange={(event) => setShowMetadata(event.target.checked)} />
                </label>
                <label className="workflow-view-toggle">
                  <span><strong>압축 보기</strong><small>한 화면에 더 많은 단계 표시</small></span>
                  <input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} />
                </label>
                <Popover.Arrow className="workflow-view-popover__arrow" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
      <div className="workflow-graph__legend" aria-label="상태 범례">
        <span><i className="is-success" />성공</span>
        <span><i className="is-running" />실행 중</span>
        <span><i className="is-waiting" />대기·승인</span>
        <span><i className="is-danger" />실패</span>
      </div>
      <div className="workflow-graph__canvas">
        {plan.steps.length > 0 ? (
          <FlowCanvas
            nodes={layout.nodes}
            edges={layout.edges}
            nodeTypes={nodeTypes}
            scrollBehavior="zoom"
            fitViewPadding={0.18}
            fitViewMinZoom={0.2}
            onNodeClick={(id) => onSelectStep?.(ownerStepId(id))}
          />
        ) : (
          <div className="workflow-graph__empty">리포지토리를 선택하면 배포 흐름이 여기에 표시됩니다.</div>
        )}
      </div>
    </section>
  );
}

function WorkflowNodeCard({ data }: NodeProps<WorkflowNode>) {
  const tone = releaseStatusTone(data.status);
  const targetPosition = data.direction === 'TB' ? Position.Top : Position.Left;
  const sourcePosition = data.direction === 'TB' ? Position.Bottom : Position.Right;
  const icon = data.kind === 'approval'
    ? <ShieldCheck size={17} />
    : data.kind === 'verification'
      ? <CheckCircle2 size={17} />
      : <GitBranch size={17} />;
  return (
    <div
      className={cx(
        'workflow-node',
        `workflow-node--${data.kind}`,
        `workflow-node--${tone}`,
        data.selected && 'is-selected',
        data.compact && 'is-compact',
      )}
      title={`${data.title} · ${releaseStatusLabel(data.status)}`}
    >
      <Handle type="target" position={targetPosition} className="workflow-node__handle" />
      <div className="workflow-node__head">
        <span className="workflow-node__icon">{icon}</span>
        <span className="workflow-node__eyebrow">{data.eyebrow}</span>
        <span className="workflow-node__status"><i />{releaseStatusLabel(data.status)}</span>
      </div>
      <strong className="workflow-node__title">{data.title}</strong>
      {data.showMetadata && data.kind === 'application' && (
        <div className="workflow-node__metadata">
          <span>{data.environment || '환경 미지정'}</span>
          <span>{data.cluster || '클러스터 미지정'}</span>
          <span>{data.strategy || '전략 미지정'}</span>
        </div>
      )}
      {data.showMetadata && data.kind !== 'application' && (
        <p className="workflow-node__note">{data.namespace}</p>
      )}
      <Handle type="source" position={sourcePosition} className="workflow-node__handle" />
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNodeCard };

function buildGraph(
  plan: ReleasePlan,
  applications: Application[],
  run: ReleaseRun | undefined,
  selectedStepId: string | undefined,
  options: { showCheckpoints: boolean; showMetadata: boolean; compact: boolean; direction: FlowDirection },
) {
  const appById = new Map(applications.map((application) => [application.application_id, application]));
  const keys = plan.steps.map(stepKey);
  const keySet = new Set(keys);
  const waveByKey = releaseWaves(plan.steps);
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const roots = new Set<string>();
  const dependedOn = new Set<string>();

  if (options.showCheckpoints && plan.steps.length > 0) {
    nodes.push(checkpointNode('preflight', '배포 전 검증', 'PRE-FLIGHT', run ? 'succeeded' : 'pending', '정책·매니페스트 진단', options));
  }

  for (const [index, step] of plan.steps.entries()) {
    const key = keys[index];
    const app = appById.get(step.application_id);
    const dependencies = step.depends_on.filter((dependency) => keySet.has(dependency));
    if (dependencies.length === 0) roots.add(key);
    dependencies.forEach((dependency) => dependedOn.add(dependency));
    const status = runStepStatus(run, step.application_id);
    const gate = resolvedGate(plan, step);
    const needsGate = options.showCheckpoints && gate !== 'auto';
    const entryId = needsGate ? `approval::${key}` : key;

    if (needsGate) {
      nodes.push({
        id: entryId,
        type: 'workflow',
        position: { x: 0, y: 0 },
        width: options.compact ? 176 : 196,
        height: options.compact ? 78 : 92,
        data: {
          kind: 'approval', title: gateLabel(gate), eyebrow: 'APPROVAL',
          status: status === 'waiting_for_approval' ? status : run ? 'succeeded' : 'pending',
          namespace: step.name || app?.name || step.application_id,
          selected: selectedStepId === key, compact: options.compact, showMetadata: options.showMetadata,
          direction: options.direction,
        },
      });
      edges.push(flowEdge(`edge-${entryId}-${key}`, entryId, key, status));
    }

    nodes.push({
      id: key,
      type: 'workflow',
      position: { x: 0, y: 0 },
      width: options.compact ? 226 : 282,
      height: options.compact ? 102 : options.showMetadata ? 136 : 106,
      data: {
        kind: 'application',
        title: step.name || app?.name || step.application_id,
        eyebrow: `WAVE ${waveByKey.get(key) ?? index + 1}`,
        status,
        environment: configString(step, 'environment', 'staging'),
        cluster: configString(step, 'cluster_id', app?.cluster_id || ''),
        strategy: optionLabel(STRATEGIES, configString(step, 'strategy', settingString(plan, 'default_strategy', 'rolling'))),
        namespace: configString(step, 'namespace', 'default'),
        selected: selectedStepId === key,
        compact: options.compact,
        showMetadata: options.showMetadata,
        direction: options.direction,
      },
    });

    if (dependencies.length > 0) {
      for (const dependency of dependencies) edges.push(flowEdge(`edge-${dependency}-${entryId}`, dependency, entryId, status));
    }
  }

  if (options.showCheckpoints && plan.steps.length > 0) {
    for (const root of roots) {
      const step = plan.steps[keys.indexOf(root)];
      const target = resolvedGate(plan, step) !== 'auto' ? `approval::${root}` : root;
      edges.push(flowEdge(`edge-preflight-${target}`, 'preflight', target, run ? 'succeeded' : 'pending'));
    }
    nodes.push(checkpointNode('verification', '배포 후 검증', 'VERIFY', run?.status === 'succeeded' ? 'succeeded' : 'pending', '상태·지표·증거 확인', options));
    keys.filter((key) => !dependedOn.has(key)).forEach((leaf) => {
      edges.push(flowEdge(`edge-${leaf}-verification`, leaf, 'verification', run?.status || 'pending'));
    });
  }

  return { nodes, edges };
}

function checkpointNode(
  kind: 'preflight' | 'verification',
  title: string,
  eyebrow: string,
  status: string,
  note: string,
  options: { showMetadata: boolean; compact: boolean; direction: FlowDirection },
): WorkflowNode {
  return {
    id: kind,
    type: 'workflow',
    position: { x: 0, y: 0 },
    width: options.compact ? 176 : 196,
    height: options.compact ? 78 : 92,
    data: { kind, title, eyebrow, status, namespace: note, selected: false, compact: options.compact, showMetadata: options.showMetadata, direction: options.direction },
  };
}

function flowEdge(id: string, source: string, target: string, status: string): WorkflowEdge {
  const tone = releaseStatusTone(status);
  return {
    id,
    source,
    target,
    type: 'animated',
    data: { active: tone === 'info', tone: tone === 'success' ? 'ok' : tone === 'warning' ? 'warn' : tone === 'danger' ? 'danger' : 'neutral' },
  };
}

function resolvedGate(plan: ReleasePlan, step: ReleasePlanStep) {
  const gate = configString(step, 'approval_gate', 'inherit');
  if (gate !== 'inherit') return gate;
  const policy = settingString(plan, 'approval_policy', 'manual_each_step');
  if (policy === 'auto_safe') return 'auto';
  if (policy === 'external_change_ticket') return 'safe_pr';
  if (policy === 'production_only') {
    return configString(step, 'environment', 'staging') === 'production' ? 'manual' : 'auto';
  }
  return 'manual';
}

function gateLabel(gate: string) {
  if (gate === 'safe_pr') return 'Safe PR 확인';
  return '수동 승인';
}

function ownerStepId(nodeId: string) {
  if (nodeId.startsWith('approval::')) return nodeId.slice('approval::'.length);
  return nodeId;
}
