import { useState } from "react";

export default function JobCancellablePipelineExample() {
  const [cancelled, setCancelled] = useState(false);

  return (
    <div className={cancelled ? "pipeline-card cancelled" : "pipeline-card"}>
      <strong>{cancelled ? "Pipeline cancelled" : "Pipeline running"}</strong>
      <div className="progress-track"><div style={{ width: cancelled ? "42%" : "68%" }} /></div>
      <button className="command-trigger" onClick={() => setCancelled(true)}>Cancel Pipeline</button>
    </div>
  );
}
