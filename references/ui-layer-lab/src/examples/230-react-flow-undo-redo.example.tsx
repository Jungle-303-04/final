import { Background, ReactFlow, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const initialNodes: Node[] = [{ id: "1", position: { x: 180, y: 150 }, data: { label: "되돌릴 수 있는 노드" } }];

export default function ReactFlowUndoRedoExample() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  function moveNode(x: number) {
    setNodes((items) => items.map((node) => (node.id === "1" ? { ...node, position: { ...node.position, x } } : node)));
  }

  return (
    <div className="flow-shell">
      <div className="flow-panel">
        <button className="stable-wide" onClick={() => moveNode(300)} type="button">이동</button>
        <button className="stable-wide" onClick={() => moveNode(180)} type="button">되돌리기</button>
      </div>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}
