import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Badge, Button, Tabs, cx } from '@/ui';
import { FlowCanvas, useAutoLayout, type FlowEdgeData } from '@/shared/flow';
import { modules } from '../data';
import { FlowIcon } from '../icons';
import { ModuleFrame, ReferenceCode } from './ReferenceScaffold';
import './react-flow-reference.css';

type FlowMode = 'workflow' | 'layout' | 'subflow';
type ActionTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';
type ActionNodeData = {
  label: string;
  detail: string;
  tone: ActionTone;
  active?: boolean;
};
type LabNode = Node<ActionNodeData | { label: string }>;
type LabEdge = Edge;

const moduleMeta = modules.find((item) => item.id === 'reactflow')!;

const modeItems = [
  { value: 'workflow', label: '기본 캔버스' },
  { value: 'layout', label: '자동 배치' },
  { value: 'subflow', label: 'Sub Flow' },
];

const nodeTypes: NodeTypes = { action: ActionNode };

export function ReactFlowReferenceDemo() {
  const [mode, setMode] = useState<FlowMode>('workflow');
  const variant = useMemo(() => buildVariant(mode), [mode]);
  const [nodes, setNodes, onNodesChange] = useNodesState<LabNode>(variant.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<LabEdge>(variant.edges);
  const autoLayout = useAutoLayout(nodes as Node[], edges as Edge<FlowEdgeData>[], 'LR');
  const displayedNodes = mode === 'layout' ? (autoLayout.nodes as LabNode[]) : nodes;
  const displayedEdges = mode === 'layout' ? autoLayout.edges : edges;

  useEffect(() => {
    setNodes(variant.nodes);
    setEdges(variant.edges);
  }, [setEdges, setNodes, variant]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((items) => addEdge({ ...connection, type: 'smoothstep', animated: true }, items));
  }, [setEdges]);

  return (
    <ModuleFrame
      title={moduleMeta.title}
      summary={moduleMeta.summary}
      sources={moduleMeta.sources}
      actions={<Button size="sm" leadingIcon={<FlowIcon className="h-4 w-4" />} onClick={() => setMode('layout')}>dagre 재배치 보기</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <div className="overflow-hidden rounded-panel border border-border bg-bg">
          <div className="border-b border-border bg-surface p-3">
            <Tabs items={modeItems} value={mode} onValueChange={(value) => setMode(value as FlowMode)} />
          </div>
          <div className="ui-layer-flow h-[34rem]">
            <ReactFlowProvider>
              <ReactFlow
                nodes={displayedNodes}
                edges={displayedEdges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
                fitViewOptions={{ padding: 0.22 }}
                minZoom={0.45}
                maxZoom={1.6}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={20} color="var(--ui-raised)" />
                <Controls position="bottom-left" />
                <MiniMap
                  pannable
                  zoomable
                  nodeStrokeWidth={3}
                  nodeColor={(node) => nodeColor(node as LabNode)}
                  maskColor="color-mix(in oklab, var(--ui-bg) 72%, transparent)"
                />
                <Panel position="top-left">
                  <div className="rounded-panel border border-border bg-surface px-3 py-2 shadow-soft">
                    <p className="text-caption font-semibold uppercase text-muted">React Flow</p>
                    <p className="mt-1 text-label font-semibold text-primary">{variant.title}</p>
                  </div>
                </Panel>
              </ReactFlow>
            </ReactFlowProvider>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <ReferenceCode
            path={moduleMeta.componentPath}
            notes={[
              '공식 React Flow의 nodes, edges, Controls, MiniMap, Background, Panel 조합을 직접 보여줍니다.',
              'custom node는 Handle과 NodeToolbar를 포함해 agent step, git step, approval gate에 재사용할 수 있습니다.',
              '이미 레포에 있는 shared/flow는 dagre 자동 배치와 theme-aware wrapper를 제공하므로 실서비스 그래프는 그 래퍼를 우선 사용하면 됩니다.',
            ]}
          />
          <SharedWrapperPreview />
        </div>
      </div>
    </ModuleFrame>
  );
}

function ActionNode({ data }: NodeProps<Node<ActionNodeData>>) {
  return (
    <div className={cx(
      'min-w-44 rounded-panel border bg-surface px-3 py-2 shadow-soft',
      toneBorder(data.tone),
      data.active && 'ring-2 ring-info/30',
    )}>
      <NodeToolbar isVisible={data.active} position={Position.Top}>
        <div className="rounded-control border border-border bg-surface px-2 py-1 text-caption font-semibold text-secondary shadow-soft">
          active step
        </div>
      </NodeToolbar>
      <Handle type="target" position={Position.Left} className="!border-border !bg-surface" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-label font-semibold text-primary">{data.label}</p>
          <p className="mt-1 line-clamp-2 text-caption text-muted">{data.detail}</p>
        </div>
        <span className={cx('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', toneDot(data.tone), data.active && 'motion-safe:animate-pulse')} />
      </div>
      <Handle type="source" position={Position.Right} className="!border-border !bg-surface" />
    </div>
  );
}

function SharedWrapperPreview() {
  const nodes: Node[] = [
    { id: 'prompt', type: 'group_collapsible', position: { x: 0, y: 0 }, data: { label: 'AI Prompt', count: 2, collapsed: false, tone: 'info', active: false } },
    { id: 'plan', type: 'group_collapsible', position: { x: 0, y: 0 }, data: { label: 'Plan', count: 4, collapsed: false, tone: 'ok', active: true } },
    { id: 'run', type: 'group_collapsible', position: { x: 0, y: 0 }, data: { label: 'Tool Run', count: 3, collapsed: false, tone: 'warn', active: false } },
  ];
  const edges: Edge<FlowEdgeData>[] = [
    { id: 'prompt-plan', source: 'prompt', target: 'plan', type: 'animated', data: { active: true, tone: 'info' } },
    { id: 'plan-run', source: 'plan', target: 'run', type: 'animated', data: { active: false, tone: 'warn' } },
  ];
  const laidOut = useAutoLayout(nodes, edges, 'LR');
  return (
    <div className="grid gap-3 rounded-panel border border-border bg-bg p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label font-semibold text-secondary">우리 공통 래퍼</p>
          <p className="mt-1 text-caption text-muted">frontend/src/shared/flow</p>
        </div>
        <Badge tone="info">FlowCanvas</Badge>
      </div>
      <div className="h-48 overflow-hidden rounded-panel border border-border bg-surface">
        <FlowCanvas nodes={laidOut.nodes} edges={laidOut.edges} />
      </div>
    </div>
  );
}

function buildVariant(mode: FlowMode): { title: string; nodes: LabNode[]; edges: LabEdge[] } {
  if (mode === 'subflow') {
    return {
      title: 'Group node와 parentId로 묶은 sub flow',
      nodes: [
        {
          id: 'git-group',
          type: 'group',
          position: { x: 80, y: 80 },
          style: { width: 440, height: 230, borderColor: 'var(--ui-border)', background: 'color-mix(in oklab, var(--ui-raised) 52%, transparent)' },
          data: { label: 'Git sync boundary' },
        },
        {
          id: 'fetch',
          type: 'action',
          parentId: 'git-group',
          extent: 'parent',
          position: { x: 40, y: 72 },
          data: { label: 'fetch origin', detail: '원격 refs 조회', tone: 'success' },
        },
        {
          id: 'merge',
          type: 'action',
          parentId: 'git-group',
          extent: 'parent',
          position: { x: 245, y: 72 },
          data: { label: 'merge ff-only', detail: 'fast-forward 적용', tone: 'info', active: true },
        },
        {
          id: 'notify',
          type: 'action',
          position: { x: 610, y: 160 },
          data: { label: 'job center', detail: '완료 또는 실패 이벤트 등록', tone: 'warning' },
        },
      ],
      edges: [
        { id: 'fetch-merge', source: 'fetch', target: 'merge', type: 'smoothstep', animated: true },
        { id: 'merge-notify', source: 'merge', target: 'notify', type: 'smoothstep' },
      ],
    };
  }
  if (mode === 'layout') {
    return {
      title: 'dagre 자동 배치가 적용된 agent plan',
      nodes: [
        { id: 'intent', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Intent', detail: '사용자 요청 해석', tone: 'info' } },
        { id: 'context', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Context', detail: '현재 화면과 git 상태 수집', tone: 'success' } },
        { id: 'plan', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Plan', detail: '실행 단계 생성', tone: 'info', active: true } },
        { id: 'confirm', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Confirm', detail: '위험 액션 승인 요청', tone: 'warning' } },
        { id: 'execute', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Execute', detail: 'tool call과 작업 센터 연결', tone: 'neutral' } },
      ],
      edges: [
        { id: 'intent-context', source: 'intent', target: 'context', type: 'smoothstep' },
        { id: 'context-plan', source: 'context', target: 'plan', type: 'smoothstep', animated: true },
        { id: 'plan-confirm', source: 'plan', target: 'confirm', type: 'smoothstep' },
        { id: 'confirm-execute', source: 'confirm', target: 'execute', type: 'smoothstep' },
      ],
    };
  }
  return {
    title: 'Controls, MiniMap, Background, Panel 포함 기본 예제',
    nodes: [
      { id: 'quick', type: 'action', position: { x: 40, y: 120 }, data: { label: 'AI Quick Layer', detail: 'Cmd/Ctrl + K 입력', tone: 'info', active: true } },
      { id: 'panel', type: 'action', position: { x: 330, y: 60 }, data: { label: 'Workspace Panel', detail: '대화와 결과 카드', tone: 'success' } },
      { id: 'jobs', type: 'action', position: { x: 330, y: 220 }, data: { label: 'Job Center', detail: '백그라운드 실행 상태', tone: 'warning' } },
      { id: 'logs', type: 'action', position: { x: 630, y: 140 }, data: { label: 'Drilldown Logs', detail: 'job, step, raw log', tone: 'neutral' } },
    ],
    edges: [
      { id: 'quick-panel', source: 'quick', target: 'panel', type: 'smoothstep', animated: true },
      { id: 'quick-jobs', source: 'quick', target: 'jobs', type: 'smoothstep' },
      { id: 'jobs-logs', source: 'jobs', target: 'logs', type: 'smoothstep' },
      { id: 'panel-logs', source: 'panel', target: 'logs', type: 'smoothstep' },
    ],
  };
}

function nodeColor(node: LabNode) {
  if (node.type === 'group') return 'var(--ui-border-strong)';
  const data = node.data as ActionNodeData;
  return {
    info: 'var(--ui-info)',
    success: 'var(--ui-success)',
    warning: 'var(--ui-warning)',
    danger: 'var(--ui-danger)',
    neutral: 'var(--ui-text-muted)',
  }[data.tone ?? 'neutral'];
}

function toneBorder(tone: ActionTone) {
  return {
    info: 'border-info/50',
    success: 'border-success/50',
    warning: 'border-warning/50',
    danger: 'border-danger/50',
    neutral: 'border-border',
  }[tone];
}

function toneDot(tone: ActionTone) {
  return {
    info: 'bg-info',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    neutral: 'bg-muted',
  }[tone];
}
