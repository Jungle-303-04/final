import { useState } from "react";
import { toast } from "sonner";

export default function SonnerConnectionQualityExample() {
  const [quality, setQuality] = useState("Good");

  function degrade() {
    setQuality("Degraded");
    toast.warning("Realtime updates degraded", { description: "Polling fallback is active." });
  }

  return (
    <div className="toast-state-card">
      <strong>Connection: {quality}</strong>
      <span>Realtime job events are monitored.</span>
      <button className="command-trigger" onClick={degrade}>Simulate Degrade</button>
    </div>
  );
}
