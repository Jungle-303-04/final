import { useState } from "react";

const citations = [
  { id: "1", title: "workflow.log", detail: "Step visual-smoke exited with code 1." },
  { id: "2", title: "router.tsx", detail: "The preview route was removed from the route table." }
];

export default function AiCitationsExample() {
  const [selected, setSelected] = useState(citations[0]);

  return (
    <div className="split-demo">
      <div className="ai-chat-card">
        <div className="chat-message user">Why did the preview fail?</div>
        <div className="chat-message assistant">
          The route smoke test failed after the preview page disappeared{" "}
          {citations.map((citation) => (
            <button className="citation-chip" key={citation.id} onClick={() => setSelected(citation)}>
              [{citation.id}]
            </button>
          ))}
        </div>
      </div>
      <aside className="detail-panel">
        <strong>{selected.title}</strong>
        <span>{selected.detail}</span>
      </aside>
    </div>
  );
}
