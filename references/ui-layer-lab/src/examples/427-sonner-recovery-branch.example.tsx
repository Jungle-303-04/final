import { toast } from "sonner";
import { useState } from "react";

export default function SonnerRecoveryBranchExample() {
  const [status, setStatus] = useState("No recovery");

  function fail() {
    setStatus("Failed");
    toast.error("Job failed", { action: { label: "Recover", onClick: () => setStatus("Recovery queued") } });
  }

  return (
    <div className="toast-state-card">
      <strong>{status}</strong>
      <button className="command-trigger" onClick={fail}>Fail Job</button>
    </div>
  );
}
