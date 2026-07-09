import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Background,
  ReactFlow,
  type EdgeProps
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes = [
  { id: "pull", position: { x: 0, y: 80 }, data: { label: "git pull" } },
  { id: "check", position: { x: 300, y: 80 }, data: { label: "visual check" } }
];

const edges = [{ id: "pull-check", source: "pull", target: "check", type: "label", data: { label: "after sync" } }];

const edgeTypes = {
  label: LabeledEdge
};

export default function ReactFlowEdgeLabelExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} edgeTypes={edgeTypes} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}

function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      <EdgeLabelRenderer>
        <div className="edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
          {String(data?.label ?? "")}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
