import { useState } from "react";
import { toast } from "sonner";

export default function SonnerRetryActionExample() {
  const [state, setState] = useState("Deploy failed.");

  function show() {
    toast.error("Deploy failed", {
      action: {
        label: "Retry",
        onClick: () => setState("Retry queued.")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{state}</strong>
      <button className="command-trigger" onClick={show}>Show Retry Toast</button>
    </div>
  );
}
