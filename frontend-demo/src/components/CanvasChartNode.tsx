import { Handle, Position, type NodeProps } from '@xyflow/react';
import { uiText } from '../data/labels';
import type { WorkflowNode as WorkflowNodeType } from '../types';

export function CanvasChartNode({ data, selected }: NodeProps<WorkflowNodeType>) {
  return (
    <article className={`canvas-chart-node ${selected ? 'is-selected' : ''}`}>
      <Handle className="node-handle target-handle" type="target" position={Position.Left} />
      <Handle className="node-handle source-handle" type="source" position={Position.Right} />
      <header>
        <i className={`node-accent accent-${data.accent}`} />
        <strong>{data.title}</strong>
        <span>{data.metric}%</span>
      </header>
      <div className="mini-bars">
        {(data.chartValues ?? []).map((bar, index) => (
          <i key={index} style={{ height: `${bar}%` }} />
        ))}
      </div>
      <div className="mini-chart-footer">
        <span>{uiText.chartNode.risk}</span>
        <strong>{uiText.chartNode.falling}</strong>
      </div>
    </article>
  );
}
