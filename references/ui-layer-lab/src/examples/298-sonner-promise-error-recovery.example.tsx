import { useState } from "react";
import { toast } from "sonner";

export default function SonnerPromiseErrorRecoveryExample() {
  const [status, setStatus] = useState("Idle");

  function fail() {
    setStatus("Failed");
    toast.error("Preview deploy failed", {
      description: "Recovery action keeps the failed run visible.",
      action: {
        label: "Recover",
        onClick: () => setStatus("Recovery queued")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{status}</strong>
      <button className="command-trigger" onClick={fail}>Simulate Failure</button>
    </div>
  );
}
