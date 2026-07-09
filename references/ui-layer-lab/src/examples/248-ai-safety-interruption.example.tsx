import { useState } from "react";

export default function AiSafetyInterruptionExample() {
  const [blocked, setBlocked] = useState(true);

  return (
    <div className={blocked ? "safety-card blocked" : "safety-card"}>
      <strong>{blocked ? "Approval required" : "Approved"}</strong>
      <span>AI wants to run a destructive command.</span>
      <button className="command-trigger" onClick={() => setBlocked(false)}>Approve Safe Alternative</button>
    </div>
  );
}
