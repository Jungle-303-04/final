// 그래프 공통 모듈 — 모든 그래프 뷰는 이 모듈만 사용(노드 좌표 하드코딩 금지)
// useAutoLayout: dagre 자동 배치 / AnimatedEdge: 활성 dash-flow / CollapsibleGroupNode: 접기·펼치기 / FlowCanvas: ReactFlow 래퍼
import dagre from '@dagrejs/dagre';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Background, Handle, Position, ReactFlow, ReactFlowProvider,
  getSmoothStepPath, useReactFlow,
  type Edge, type EdgeProps, type EdgeTypes, type Node, type NodeProps, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow.css';
import type { Tone } from '@/shared/lib/types';
import { cx } from '@/ui';
import { durations } from '@/ui/motion';

export type FlowDirection = 'LR' | 'TB';
/* 노드 크기 기본값 — 렌더 후 measured 값이 있으면 그것을 우선 사용 */
const NODE_W = 168;
const NODE_H = 48;

/** dagre 기반 자동 배치 — 노드/edge 데이터가 바뀌면 레이아웃 재계산 */
export function useAutoLayout(nodes: Node[], edges: Edge[], direction: FlowDirection = 'LR'): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    if (nodes.length === 0) return { nodes, edges };
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: direction, nodesep: 24, ranksep: 32, marginx: 12, marginy: 12 });
    g.setDefaultEdgeLabel(() => ({}));
    nodes.forEach(n => g.setNode(n.id, {
      width: n.measured?.width ?? n.width ?? NODE_W,
      height: n.measured?.height ?? n.height ?? NODE_H,
    }));
    edges.forEach(e => g.setEdge(e.source, e.target));
    dagre.layout(g);
    const horizontal = direction === 'LR';
    return {
      nodes: nodes.map(n => {
        const p = g.node(n.id);
        return {
          ...n,
          position: { x: p.x - p.width / 2, y: p.y - p.height / 2 },
          sourcePosition: horizontal ? Position.Right : Position.Bottom,
          targetPosition: horizontal ? Position.Left : Position.Top,
        };
      }),
      edges,
    };
  }, [nodes, edges, direction]);
}

export type FlowEdgeData = { active?: boolean; tone?: Tone };
export type AnimatedFlowEdge = Edge<FlowEdgeData>;

/** 커스텀 edge — active 면 dash-flow + 이동 패킷 애니메이션, 아니면 정적. 색은 tone → 토큰 변수 */
export function AnimatedEdge(props: EdgeProps<AnimatedFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [path] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 });
  const active = data?.active === true;
  return (
    <path
      id={id}
      d={path}
      fill="none"
      className={cx(
        'react-flow__edge-path flow-edge-path',
        active && 'flow-edge-path--active',
        flowToneEdgeClass(data?.tone ?? (active ? 'info' : 'neutral')),
      )}
    />
  );
}

export type CollapsibleGroupData = {
  label: string;
  count: number;          // 자식 수 뱃지
  collapsed: boolean;     // 표시/숨김은 부모 상태로 제어
  tone?: Tone;
  active?: boolean;
  onToggle?: () => void;
};

/** 접기/펼치기 그룹 노드 — 클릭 시 부모가 하위 노드 표시/숨김을 토글 */
export function CollapsibleGroupNode({ data }: NodeProps<Node<CollapsibleGroupData>>) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-w-40 items-center gap-2 rounded-panel border bg-surface px-4 py-3 text-body font-semibold text-primary shadow-soft transition-colors duration-[var(--ui-duration-fast)] ease-standard hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        data.tone && flowToneBorderClass(data.tone),
        data.active && 'flow-node--pulse',
      )}
      onClick={(e) => { e.stopPropagation(); data.onToggle?.(); }}
      aria-expanded={!data.collapsed}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <span className={cx('text-muted transition-transform duration-[var(--ui-duration-base)] ease-standard', data.collapsed ? '' : 'rotate-90')}>›</span>
      <span className="min-w-0 truncate">{data.label}</span>
      <span className="rounded-full border border-border bg-raised px-2 py-0.5 text-caption font-bold text-secondary">{data.count}</span>
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </button>
  );
}

const BASE_NODE_TYPES: NodeTypes = { group_collapsible: CollapsibleGroupNode };
const EDGE_TYPES: EdgeTypes = { animated: AnimatedEdge };

/* 콘솔 테마(data-theme-mode)를 따라가는 colorMode — 토글 시 즉시 반영(MutationObserver) */
function useDocThemeMode(): 'dark' | 'light' {
  const read = () => (document.documentElement.getAttribute('data-theme-mode') === 'light' ? 'light' as const : 'dark' as const);
  const [mode, setMode] = useState<'dark' | 'light'>(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setMode(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-mode'] });
    return () => obs.disconnect();
  }, []);
  return mode;
}

/* 레이아웃(노드 구성)이 바뀔 때 다시 fitView — 접기/펼치기·데이터 갱신 대응 */
function FitOnChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const raf = requestAnimationFrame(() => { fitView({ duration: Math.round(durations.slow * 1000), padding: 0.15 }); });
    return () => cancelAnimationFrame(raf);
  }, [signature, fitView]);
  return null;
}

/** ReactFlow 공통 래퍼 — grid 배경/fitView/zoom 범위/panOnScroll/테마 토큰 */
export function FlowCanvas({ nodes, edges, nodeTypes, onNodeClick, children }: {
  nodes: Node[]; edges: Edge[]; nodeTypes?: NodeTypes;
  onNodeClick?: (id: string) => void; children?: ReactNode;
}) {
  const types = useMemo(() => ({ ...BASE_NODE_TYPES, ...nodeTypes }), [nodeTypes]);
  const colorMode = useDocThemeMode();
  return (
    <ReactFlowProvider>
      <div className="h-full w-full">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={types} edgeTypes={EDGE_TYPES}
          fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.55} maxZoom={1.6} panOnScroll
          nodesDraggable={false} nodesConnectable={false} colorMode={colorMode}
          proOptions={{ hideAttribution: true }}
          onNodeClick={onNodeClick ? (_e, n) => onNodeClick(n.id) : undefined}
        >
          <Background gap={20} color="var(--ui-raised)" />
          <FitOnChange signature={nodes.map(n => n.id).join('|')} />
          {children}
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

function flowToneBorderClass(tone: Tone) {
  return {
    ok: 'border-success/50',
    warn: 'border-warning/50',
    danger: 'border-danger/50',
    info: 'border-info/50',
    neutral: 'border-border',
  }[tone];
}

function flowToneEdgeClass(tone: Tone) {
  return {
    ok: 'flow-edge-path--success',
    warn: 'flow-edge-path--warning',
    danger: 'flow-edge-path--danger',
    info: 'flow-edge-path--info',
    neutral: 'flow-edge-path--neutral',
  }[tone];
}
