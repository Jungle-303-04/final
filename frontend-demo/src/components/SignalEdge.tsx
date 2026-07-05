import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { SignalEdge as SignalEdgeType } from '../types';

const edgeColors = {
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#8b5cf6',
  amber: '#f59e0b',
  slate: '#94a3b8',
  rose: '#fb7185',
};

function hashId(value: string) {
  return [...value].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 997, 17);
}

export function SignalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<SignalEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.34,
  });
  const color = edgeColors[data?.accent ?? 'blue'];
  const status = data?.status ?? 'idle';
  const seed = hashId(id);
  const packetCount = status === 'running' ? 1 : status === 'done' ? 1 : 0;
  const baseCadence = data?.cadenceMs ?? 1000;

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        className={`signal-edge signal-${status}`}
        style={{
          stroke: color,
          strokeWidth: status === 'running' ? 3 : 2.25,
          strokeDasharray: status === 'done' ? '7 8' : '12 12',
        }}
      />
      <path className="signal-edge-glow" d={edgePath} fill="none" style={{ stroke: color }} />
      {Array.from({ length: packetCount }, (_, index) => {
        const duration = Math.max(0.9, (baseCadence + ((seed + index * 137) % 520)) / 820);
        const begin = -(((seed % 11) + index * 2.7) / 4);
        const radius = status === 'running' ? 3.4 + ((seed + index) % 3) * 0.5 : 2.5;
        return (
          <circle className={`event-packet packet-${index + 1}`} fill={color} key={`${id}-packet-${index}`} r={radius}>
            <animateMotion
              begin={`${begin}s`}
              calcMode="spline"
              dur={`${duration}s`}
              keySplines="0.28 0.64 0.32 1; 0.42 0 0.38 1"
              keyTimes="0;0.58;1"
              path={edgePath}
              repeatCount="indefinite"
            />
          </circle>
        );
      })}
      {data?.label ? (
        <EdgeLabelRenderer>
          <span className="edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {data.event ?? data.label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
      {data?.event && !data.label ? (
        <EdgeLabelRenderer>
          <span className="edge-label event-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {data.event}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
