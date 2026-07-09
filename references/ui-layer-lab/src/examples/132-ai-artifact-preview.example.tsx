import { useState } from "react";

const artifacts = {
  summary: "The deploy failed after /preview returned 404.",
  patch: "- remove old route\n+ restore preview route",
  checklist: "1. Restore route\n2. Rerun smoke\n3. Push branch"
};

export default function AiArtifactPreviewExample() {
  const [artifact, setArtifact] = useState<keyof typeof artifacts>("summary");

  return (
    <div className="artifact-layout">
      <div className="ai-chat-card">
        <div className="chat-message assistant">I generated three artifacts from the failed run.</div>
        <div className="segmented-row">
          {Object.keys(artifacts).map((key) => (
            <button className={artifact === key ? "active" : ""} key={key} onClick={() => setArtifact(key as keyof typeof artifacts)}>
              {key}
            </button>
          ))}
        </div>
      </div>
      <pre className="artifact-preview">{artifacts[artifact]}</pre>
    </div>
  );
}
