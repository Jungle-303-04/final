import { useState } from "react";
import { toast } from "sonner";

export default function SonnerActionTimeoutExample() {
  const [state, setState] = useState("Waiting");

  function show() {
    toast.warning("Rollback available for 10s", {
      action: { label: "Rollback", onClick: () => setState("Rollback started") },
      duration: 10000
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{state}</strong>
      <button className="command-trigger" onClick={show}>Show Timeout Action</button>
    </div>
  );
}
