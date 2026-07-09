import { useState } from "react";

const memories = ["repo conventions", "preferred branch", "test command"];

export default function AiMemoryToggleExample() {
  const [enabled, setEnabled] = useState(["repo conventions"]);

  return (
    <div className="context-chip-card">
      <strong>Memory context</strong>
      <div className="chip-row">
        {memories.map((memory) => (
          <button className={enabled.includes(memory) ? "active" : ""} key={memory} onClick={() => setEnabled((items) => (items.includes(memory) ? items.filter((item) => item !== memory) : [...items, memory]))}>
            {memory}
          </button>
        ))}
      </div>
      <span>{enabled.length} memories attached</span>
    </div>
  );
}
