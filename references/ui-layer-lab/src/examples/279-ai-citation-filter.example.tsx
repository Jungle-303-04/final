import { useState } from "react";

const sources = ["workflow.log", "diff.patch", "README.md"];

export default function AiCitationFilterExample() {
  const [source, setSource] = useState("workflow.log");

  return (
    <div className="sidecar-tabs">
      <div className="ai-chat-card">
        <strong>Answer</strong>
        <span>Answer linked to {source}</span>
      </div>
      <aside className="detail-panel">
        {sources.map((item) => <button className="row-button" key={item} onClick={() => setSource(item)}>{item}</button>)}
      </aside>
    </div>
  );
}
