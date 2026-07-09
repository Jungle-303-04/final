import { Background } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";
import { useMemo, useState } from "react";

export default function ReactFlowExpandCollapseExample() {
  const [expanded, setExpanded] = useState(false);
  const nodes = useMemo(
    () =>
      expanded
        ? [
            { id: "root", position: { x: 220, y: 40 }, data: { label: "배포" } },
            { id: "a", position: { x: 0, y: 180 }, data: { label: "빌드" } },
            { id: "b", position: { x: 220, y: 180 }, data: { label: "스모크" } },
            { id: "c", position: { x: 440, y: 180 }, data: { label: "알림" } }
          ]
        : [{ id: "root", position: { x: 220, y: 120 }, data: { label: "배포 +3" } }],
    [expanded]
  );
  const edges = expanded
    ? [
        { id: "root-a", source: "root", target: "a" },
        { id: "root-b", source: "root", target: "b" },
        { id: "root-c", source: "root", target: "c" }
      ]
    : [];

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={() => setExpanded((value) => !value)}>
        {expanded ? "접기" : "펼치기"}
      </button>
      <div className="flow-example">
        <InteractiveReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
        </InteractiveReactFlow>
      </div>
    </div>
  );
}
