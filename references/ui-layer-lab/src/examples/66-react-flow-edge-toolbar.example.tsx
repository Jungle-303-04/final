import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  ReactFlow,
  getBezierPath,
  type Edge,
  type EdgeProps
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type ToolbarEdge = Edge<{ action: string }, "toolbar">;

const nodes = [
  { id: "1", position: { x: 0, y: 120 }, data: { label: "실패 단계" } },
  { id: "2", position: { x: 300, y: 120 }, data: { label: "로그 열기" } }
];

const edges: ToolbarEdge[] = [{ id: "1-2", source: "1", target: "2", type: "toolbar", data: { action: "보기" } }];

const edgeTypes = { toolbar: ToolbarEdgeComponent };

export default function ReactFlowEdgeToolbarExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} edgeTypes={edgeTypes} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}

function ToolbarEdgeComponent(props: EdgeProps<ToolbarEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath(props);

  return (
    <>
      <BaseEdge id={props.id} path={edgePath} />
      <EdgeLabelRenderer>
        <div className="edge-toolbar" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
          <button type="button">{props.data?.action}</button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
