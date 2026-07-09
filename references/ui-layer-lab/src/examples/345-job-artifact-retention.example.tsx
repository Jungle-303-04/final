import { useState } from "react";

export default function JobArtifactRetentionExample() {
  const [days, setDays] = useState(7);

  return (
    <div className="retention-card">
      <strong>Artifact retention: {days} days</strong>
      <input type="range" min="1" max="30" value={days} onChange={(event) => setDays(Number(event.target.value))} />
      <span>{days > 14 ? "Long-lived artifact" : "Short retention"}</span>
    </div>
  );
}
