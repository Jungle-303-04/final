import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Node,
} from '@xyflow/react';
import { Activity, BarChart3, GitBranchPlus, Moon, Play, RotateCcw, ShieldPlus, Sun } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { uiText } from './data/labels';
import { initialRealtimeFrame, nextRealtimeFrame } from './data/realtime';
import {
  createCanvasChartEdge,
  createCanvasChartNode,
  createEvidenceEdge,
  createEvidenceNode,
  createPolicyGateEdges,
  createPolicyGateNode,
  initialEdges,
  initialEvents,
  initialMetrics,
  initialNodes,
  runtimeEvents,
  statusOrder,
} from './data/workflow';
import { CanvasChartNode } from './components/CanvasChartNode';
import { CopilotPanel } from './components/CopilotPanel';
import { DashboardPanel } from './components/DashboardPanel';
import { FeatureWorkspace } from './components/FeaturePages';
import { SignalEdge } from './components/SignalEdge';
import { StudioHud } from './components/StudioHud';
import { WorkflowNode } from './components/WorkflowNode';
import { featurePages } from './data/features';
import { operationsSnapshot as ops } from './data/operations';
import { useRafPerformance } from './hooks/useRafPerformance';
import type { FeaturePageId, RuntimeMetrics, SignalEdge as SignalEdgeType, ThemeMode, TimelineEvent, WorkflowNode as WorkflowNodeType } from './types';

const nodeTypes = {
  workflow: WorkflowNode,
  canvasChart: CanvasChartNode,
};

const edgeTypes = {
  signal: SignalEdge,
};

const now = () =>
  new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

function bounded(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function mutateMetrics(metrics: RuntimeMetrics): RuntimeMetrics {
  const latencyNext = bounded((metrics.latency.at(-1)?.value ?? 1840) + Math.random() * 180 - 110, 420, 2200);
  const rotate = (points: RuntimeMetrics['latency']) => [
    ...points.slice(1),
    { label: now(), value: latencyNext },
  ];

  return {
    confidence: bounded(metrics.confidence + Math.random() * 7 - 2, 70, 96),
    blastRadius: bounded(metrics.blastRadius + Math.random() * 8 - 5, 12, 48),
    evidenceCount: bounded(metrics.evidenceCount + (Math.random() > 0.68 ? 1 : Math.random() > 0.82 ? -1 : 0), 0, ops.evidenceJobs.queued),
    pendingActions: bounded(metrics.pendingActions + Math.random() * 3 - 1.4, 1, 6),
    latency: rotate(metrics.latency),
    saturation: metrics.saturation.map((point) => ({
      ...point,
      value: bounded(point.value + Math.random() * 14 - 7, 22, 88),
    })),
    incidents: metrics.incidents.map((point) => ({
      ...point,
      value: bounded(point.value + Math.random() * 8 - 4, 8, 48),
    })),
  };
}

function AppContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeType>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<SignalEdgeType>(initialEdges);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [live, setLive] = useState(true);
  const [chartNodeVisible, setChartNodeVisible] = useState(false);
  const [collapsedView, setCollapsedView] = useState(false);
  const [activePage, setActivePage] = useState<FeaturePageId>('action-flow');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [realtimeFrame, setRealtimeFrame] = useState(initialRealtimeFrame);
  const timers = useRef<number[]>([]);
  const fps = useRafPerformance(live);
  const selectedNode = nodes.find((node) => node.selected);
  const activeFeature = featurePages.find((page) => page.id === activePage) ?? featurePages[0];

  useEffect(() => {
    if (!live) return undefined;
    const id = window.setInterval(() => {
      setMetrics((current) => mutateMetrics(current));
      setRealtimeFrame((current) => nextRealtimeFrame(current));
    }, 1800);
    return () => window.clearInterval(id);
  }, [live]);

  useEffect(() => {
    return () => {
      timers.current.forEach(window.clearTimeout);
    };
  }, []);

  const pushEvent = useCallback((event: Omit<TimelineEvent, 'id' | 'time'>) => {
    setEvents((current) => [
      {
        id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        time: now(),
        ...event,
      },
      ...current,
    ]);
  }, []);

  const updateNodeStatus = useCallback(
    (id: string, status: WorkflowNodeType['data']['status']) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === id
            ? {
                ...node,
                selected: true,
                data: {
                  ...node.data,
                  status,
                  metric: node.data.metric,
                },
              }
            : { ...node, selected: false },
        ),
      );
    },
    [setNodes],
  );

  const updateEdgeStatus = useCallback(
    (targetNodeId: string, status: NonNullable<SignalEdgeType['data']>['status']) => {
      setEdges((current) =>
        current.map((edge) =>
          edge.target === targetNodeId
            ? {
                ...edge,
                animated: status === 'running',
                data: {
                  ...(edge.data ?? { accent: 'blue' }),
                  status,
                },
              }
            : edge,
        ),
      );
    },
    [setEdges],
  );

  const resetDemo = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setNodes(initialNodes);
    setEdges(initialEdges);
    setMetrics(initialMetrics);
    setEvents(initialEvents);
    setRealtimeFrame(initialRealtimeFrame);
    setChartNodeVisible(false);
    setCollapsedView(false);
  }, [setEdges, setNodes]);

  const runFlow = useCallback(() => {
    setActivePage('action-flow');
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    pushEvent(runtimeEvents.flowStarted);

    statusOrder.forEach((nodeId, index) => {
      const startTimer = window.setTimeout(() => {
        updateNodeStatus(nodeId, 'running');
        updateEdgeStatus(nodeId, 'running');
        pushEvent(runtimeEvents.edgeActivated(nodeId, index % 2 ? 'purple' : 'green'));
      }, index * 760);
      const doneTimer = window.setTimeout(() => {
        updateNodeStatus(nodeId, 'done');
        updateEdgeStatus(nodeId, 'done');
      }, index * 760 + 520);
      timers.current.push(startTimer, doneTimer);
    });
  }, [pushEvent, updateEdgeStatus, updateNodeStatus]);

  const addEvidenceNode = useCallback(() => {
    const id = `evidence-${Date.now()}`;
    const offset = nodes.filter((node) => node.id.startsWith('evidence-')).length;
    const evidenceNode = createEvidenceNode(id, offset);
    const evidenceEdge = createEvidenceEdge(evidenceNode);
    setNodes((current) => [...current, evidenceNode]);
    setEdges((current) => [...current, evidenceEdge]);
    setMetrics((current) => ({ ...current, evidenceCount: Math.min(ops.evidenceJobs.queued, current.evidenceCount + 1) }));
    pushEvent(runtimeEvents.evidenceCreated(evidenceNode.data.accent));
  }, [nodes, pushEvent, setEdges, setNodes]);

  const connectNodes = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      const accent = sourceNode?.data.accent ?? targetNode?.data.accent ?? 'blue';
      const edge: SignalEdgeType = {
        ...connection,
        id: `manual-${connection.source}-${connection.target}-${Date.now()}`,
        type: 'signal',
        animated: true,
        data: {
          accent,
          status: 'running',
          event: 'manual.connection',
          cadenceMs: 980,
        },
      };

      setEdges((current) => addEdge(edge, current));
      pushEvent({
        title: '수동 연결 생성',
        detail: `${sourceNode?.data.title ?? connection.source} → ${targetNode?.data.title ?? connection.target}`,
        tone: accent,
      });
    },
    [nodes, pushEvent, setEdges],
  );

  const addApprovalGate = useCallback(() => {
    const existing = nodes.some((node) => node.id === 'policy-gate');
    if (existing) {
      pushEvent(runtimeEvents.approvalGateExists);
      return;
    }
    const gateNode = createPolicyGateNode();
    setNodes((current) => [...current, gateNode]);
    setEdges((current) => [...current, ...createPolicyGateEdges()]);
    pushEvent(runtimeEvents.approvalGateCreated);
  }, [nodes, pushEvent, setEdges, setNodes]);

  const autoLayout = useCallback(() => {
    const layoutMap: Record<string, { x: number; y: number }> = {
      copilot: { x: 20, y: 270 },
      session: { x: 420, y: 80 },
      observe: { x: 420, y: 430 },
      evidence: { x: 820, y: 250 },
      rca: { x: 1220, y: 115 },
      plan: { x: 1220, y: 485 },
      review: { x: 1605, y: 300 },
      'policy-gate': { x: 1585, y: 650 },
      'canvas-chart': { x: 1560, y: 55 },
    };

    setActivePage('action-flow');
    setNodes((current) =>
      current.map((node, index) => ({
        ...node,
        position: layoutMap[node.id] ?? { x: 840 + (index % 3) * 210, y: 820 + Math.floor(index / 3) * 128 },
        data: {
          ...node.data,
          collapsed: false,
        },
      })),
    );
    setCollapsedView(false);
    pushEvent({
      title: '자동 레이아웃 적용',
      detail: '노드가 데이터 흐름 기준으로 다시 배치됨',
      tone: 'amber',
    });
  }, [pushEvent, setNodes]);

  const toggleCollapsedView = useCallback(() => {
    const next = !collapsedView;
    setActivePage('action-flow');
    setCollapsedView(next);
    setNodes((nodeList) =>
      nodeList.map((node) => ({
        ...node,
        data: {
          ...node.data,
          collapsed: next,
        },
      })),
    );
    pushEvent({
      title: next ? '노드 압축 보기' : '노드 상세 보기',
      detail: next ? '복잡한 블록과 설정을 접었습니다' : '설정, 포트, 중첩 블록을 다시 펼쳤습니다',
      tone: next ? 'slate' : 'blue',
    });
  }, [collapsedView, pushEvent, setNodes]);

  const toggleChartNode = useCallback(() => {
    if (chartNodeVisible) {
      setNodes((current) => current.filter((node) => node.id !== 'canvas-chart'));
      setEdges((current) => current.filter((edge) => edge.id !== 'observe-canvas-chart'));
      setChartNodeVisible(false);
      pushEvent(runtimeEvents.chartNodeRemoved);
      return;
    }
    const chartNode = createCanvasChartNode(metrics.confidence);
    setNodes((current) => [...current, chartNode]);
    setEdges((current) => [...current, createCanvasChartEdge()]);
    setChartNodeVisible(true);
    pushEvent(runtimeEvents.chartNodeCreated);
  }, [chartNodeVisible, metrics.confidence, pushEvent, setEdges, setNodes]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  return (
    <main className="app-shell" data-theme={theme}>
      <DashboardPanel
        metrics={metrics}
        events={events}
        live={live}
        activePage={activePage}
        onPageChange={setActivePage}
        realtimeFrame={realtimeFrame}
      />

      <section className="canvas-shell">
        <header className="topbar">
          <div className="brand-block">
            <span className="brand-mark" />
            <div>
              <strong>{activeFeature.title}</strong>
              <p>{activePage === 'action-flow' ? uiText.canvas.subtitle : activeFeature.summary}</p>
            </div>
          </div>
          <div className="toolbar">
            <span className={`fps-chip ${fps < 50 ? 'is-low' : ''}`} title="requestAnimationFrame 기반 실측값">
              {fps.toFixed(1)} FPS · {(1000 / Math.max(fps, 1)).toFixed(1)}ms
            </span>
            <span className="fps-chip">seq {ops.realtime.seq}</span>
            {activePage === 'action-flow' ? (
              <>
                <button type="button" onClick={runFlow}>
                  <Play size={16} />
                  {uiText.toolbar.run}
                </button>
                <button type="button" onClick={addEvidenceNode}>
                  <GitBranchPlus size={16} />
                  {uiText.toolbar.evidence}
                </button>
                <button type="button" onClick={addApprovalGate}>
                  <ShieldPlus size={16} />
                  {uiText.toolbar.gate}
                </button>
                <button type="button" onClick={toggleChartNode} className={chartNodeVisible ? 'is-active' : ''}>
                  <BarChart3 size={16} />
                  {uiText.toolbar.chartNode}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setActivePage('action-flow')}>
                <GitBranchPlus size={16} />
                {uiText.toolbar.openCanvas}
              </button>
            )}
            <button type="button" onClick={() => setLive((value) => !value)} className={live ? 'is-active' : ''}>
              <Activity size={16} />
              {uiText.toolbar.live}
            </button>
            <button
              type="button"
              onClick={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? uiText.toolbar.lightMode : uiText.toolbar.darkMode}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button type="button" onClick={resetDemo} aria-label={uiText.toolbar.reset}>
              <RotateCcw size={16} />
            </button>
          </div>
        </header>

        <div className="flow-frame">
          {activePage === 'action-flow' ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={connectNodes}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              minZoom={0.28}
              maxZoom={1.35}
              defaultViewport={{ x: 14, y: 82, zoom: 0.48 }}
              fitView={false}
              onlyRenderVisibleElements
              zoomOnScroll={false}
              panOnScroll
              panOnScrollSpeed={0.8}
              connectionRadius={36}
              connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2.5, strokeDasharray: '8 8' }}
              proOptions={proOptions}
            >
              <Background color="#2a2d38" gap={26} size={1.3} variant={BackgroundVariant.Dots} />
              <Controls className="flow-controls" showInteractive={false} />
              <MiniMap
                className="flow-minimap"
                pannable
                zoomable
                nodeColor={(node: Node) => {
                  const data = node.data as WorkflowNodeType['data'];
                  if (data.accent === 'green') return '#22c55e';
                  if (data.accent === 'purple') return '#8b5cf6';
                  if (data.accent === 'amber') return '#f59e0b';
                  if (data.accent === 'rose') return '#fb7185';
                  return '#3b82f6';
                }}
              />
              <Panel position="bottom-center" className="studio-hud-panel">
                <StudioHud metrics={metrics} events={events} frame={realtimeFrame} />
              </Panel>
            </ReactFlow>
          ) : (
            <FeatureWorkspace
              pageId={activePage}
              metrics={metrics}
              events={events}
              realtimeFrame={realtimeFrame}
              onPageChange={setActivePage}
            />
          )}
        </div>
      </section>

      <CopilotPanel
        selectedNode={selectedNode}
        metrics={metrics}
        events={events}
        live={live}
        chartNodeVisible={chartNodeVisible}
        onRunFlow={runFlow}
        onAddEvidence={addEvidenceNode}
        onToggleChartNode={toggleChartNode}
        onAutoLayout={autoLayout}
        onToggleCollapse={toggleCollapsedView}
      />
    </main>
  );
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ReactFlowProvider>
        <AppContent />
      </ReactFlowProvider>
    </MotionConfig>
  );
}
