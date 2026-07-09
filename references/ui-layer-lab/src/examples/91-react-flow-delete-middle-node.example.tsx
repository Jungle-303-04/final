import { Background, ReactFlow, getIncomers, getOutgoers, useEdgesState, useNodesState, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback } from "react";

const initialNodes: Node[] = [
  { id: "a", position: { x: 0, y: 100 }, data: { label: "Start" } },
  { id: "b", position: { x: 260, y: 100 }, data: { label: "Review" } },
  { id: "c", position: { x: 520, y: 100 }, data: { label: "Ship" } }
];

const initialEdges: Edge[] = [
  { id: "a-b", source: "a", target: "b" },
  { id: "b-c", source: "b", target: "c" }
];

export default function ReactFlowDeleteMiddleNodeExample() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const deleteMiddle = useCallback(() => {
    const deleted = nodes.find((nodes) => nodes.id === "b");
    if (!deleted) return;
    const incomers = getIncomers(deleted, nodes, edges);
    const outgoers = getOutgoers(deleted, nodes, edges);
    setNodes((items) => items.filter((nodes) => nodes.id !== deleted.id));
    setEdges([
      ...edges.filter((edge) => edge.source !== deleted.id && edge.target !== deleted.id),
      ...incomers.flatMap((source) => outgoers.map((target) => ({ id: `${source.id}-${target.id}`, source: source.id, target: target.id })))
    ]);
  }, [edges, nodes, setEdges, setNodes]);

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={deleteMiddle}>Delete Review</button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}
