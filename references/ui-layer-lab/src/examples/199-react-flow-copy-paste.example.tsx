import { Background, ReactFlow, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const initialNodes: Node[] = [{ id: "1", position: { x: 180, y: 160 }, data: { label: "선택 노드" } }];

export default function ReactFlowCopyPasteExample() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  function duplicate() {
    setNodes((items) => [
      ...items,
      { id: String(items.length + 1), position: { x: 180 + items.length * 80, y: 160 + items.length * 45 }, data: { label: `복사 ${items.length}` } }
    ]);
  }

  return (
    <div className="flow-shell">
      <button className="command-trigger stable-wide" onClick={duplicate} type="button">노드 복제</button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}
