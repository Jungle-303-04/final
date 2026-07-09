import { useState } from "react";

export default function AiErrorRecoveryPanelExample() {
  const [state, setState] = useState("Tool call failed: missing preview URL.");

  return (
    <div className="retry-card failed">
      <strong>AI recovery</strong>
      <span>{state}</span>
      <button className="command-trigger" onClick={() => setState("Recovery prompt queued with fallback URL.")}>Retry With Context</button>
    </div>
  );
}
