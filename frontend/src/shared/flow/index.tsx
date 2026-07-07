// 그래프 공통 모듈 — 모든 그래프 뷰는 이 모듈만 사용(노드 좌표 하드코딩 금지)
// useAutoLayout: dagre 자동 배치 / AnimatedEdge: 활성 dash-flow / CollapsibleGroupNode: 접기·펼치기 / FlowCanvas: ReactFlow 래퍼
import dagre from '@dagrejs/dagre';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Background, BaseEdge, Handle, Position, ReactFlow, ReactFlowProvider,
  getSmoothStepPath, useReactFlow,
  type Edge, type EdgeProps, type EdgeTypes, type Node, type NodeProps, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow.css';
import type { Tone } from '@/shared/lib/types';
import { toneColor } from '@/shared/ui/status';
import { IconChevronRight } from '@/shared/ui/icons';

export type FlowDirection = 'LR' | 'TB';
/* 노드 크기 기본값 — 렌더 후 measured 값이 있으면 그것을 우선 사용 */
const NODE_W = 168;
const NODE_H = 48;

/** dagre 기반 자동 배치 — 노드/edge 데이터가 바뀌면 레이아웃 재계산 */
export function useAutoLayout(nodes: Node[], edges: Edge[], direction: FlowDirection = 'LR'): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    if (nodes.length === 0) return { nodes, edges };
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: direction, nodesep: 28, ranksep: 60, marginx: 12, marginy: 12 });
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
  const stroke = data?.tone ? toneColor(data.tone) : active ? toneColor('info') : 'var(--border)';
  return (
    <>
      <BaseEdge
        id={id} path={path}
        style={{
          stroke, strokeWidth: active ? 2 : 1.5,
          strokeDasharray: active ? '6 4' : undefined,
          animation: active ? 'flow-dash calc(var(--dur-slow) * 2) linear infinite' : undefined,
        }}
      />
      {/* 활성 구간을 흐르는 패킷 — reactflow.dev animating-edges 패턴(SVG animateMotion) */}
      {active && (
        <circle className="flow-packet" r={3.5} fill={stroke}>
          <animateMotion dur="1.4s" repeatCount="indefinite" path={path} />
        </circle>
      )}
    </>
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
    <div
      className={`flow-group ${data.active ? 'flow-node--pulse' : ''}`}
      style={data.tone ? { borderColor: toneColor(data.tone) } : undefined}
      onClick={(e) => { e.stopPropagation(); data.onToggle?.(); }}
      role="button" aria-expanded={!data.collapsed}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <span className={`flow-group__chev ${data.collapsed ? '' : 'flow-group__chev--open'}`}><IconChevronRight size={13} /></span>
      {data.label}
      <span className="flow-group__count">{data.count}</span>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
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
    const raf = requestAnimationFrame(() => { fitView({ duration: 300, padding: 0.15 }); });
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
      <div style={{ width: '100%', height: '100%' }}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={types} edgeTypes={EDGE_TYPES}
          fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.3} maxZoom={1.6} panOnScroll
          nodesDraggable={false} nodesConnectable={false} colorMode={colorMode}
          proOptions={{ hideAttribution: true }}
          onNodeClick={onNodeClick ? (_e, n) => onNodeClick(n.id) : undefined}
        >
          <Background gap={20} color="var(--surface-2)" />
          <FitOnChange signature={nodes.map(n => n.id).join('|')} />
          {children}
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
