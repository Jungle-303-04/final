import { Background } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";

const nodes = [
  {
    id: "1",
    position: { x: 180, y: 120 },
    data: { label: <div className="drag-handle-nodes"><span className="drag-handle">이동</span><strong>핸들만 끌 수 있습니다</strong></div> },
    dragHandle: ".drag-handle"
  }
];

export default function ReactFlowDragHandleExample() {
  return (
    <div className="flow-example">
      <InteractiveReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
      </InteractiveReactFlow>
    </div>
  );
}
