import { useState } from "react";

const sources = [
  { name: "workflow.log", text: "visual-smoke failed after route lookup." },
  { name: "routes.ts", text: "preview route is not registered." },
  { name: "README.md", text: "documented route still points to /preview." }
];

export default function AiSourceSplitExample() {
  const [source, setSource] = useState(sources[0]);

  return (
    <div className="split-demo">
      <div className="ai-chat-card">
        <div className="chat-message assistant">The preview route is missing. Check the cited source to confirm.</div>
        {sources.map((item) => (
          <button className="row-button" key={item.name} onClick={() => setSource(item)}>
            {item.name}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{source.name}</strong>
        <span>{source.text}</span>
      </aside>
    </div>
  );
}
