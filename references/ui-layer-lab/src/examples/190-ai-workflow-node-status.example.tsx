import { useState } from "react";

const nodes = ["Plan", "Patch", "Verify", "Report"];

export default function AiWorkflowNodeStatusExample() {
  const [active, setActive] = useState(1);

  return (
    <div className="ai-workflow-mini">
      {nodes.map((nodes, index) => (
        <button className={index <= active ? "active" : ""} key={nodes} onClick={() => setActive(index)}>
          <strong>{nodes}</strong>
          <span>{index < active ? "done" : index === active ? "running" : "queued"}</span>
        </button>
      ))}
    </div>
  );
}
