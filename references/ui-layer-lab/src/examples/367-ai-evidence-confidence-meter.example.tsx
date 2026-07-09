import { useState } from "react";

export default function AiEvidenceConfidenceMeterExample() {
  const [confidence, setConfidence] = useState(68);

  return (
    <div className="resource-meter">
      <section>
        <strong>Evidence confidence {confidence}%</strong>
        <div className="progress-track"><div style={{ width: `${confidence}%` }} /></div>
      </section>
      <button className="command-trigger" onClick={() => setConfidence((value) => Math.min(96, value + 14))}>Add Source</button>
    </div>
  );
}
