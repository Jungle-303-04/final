import { useState } from "react";
import { toast } from "sonner";

export default function SonnerDestructiveConfirmExample() {
  const [state, setState] = useState("Preview environment is running.");

  function confirm() {
    toast.warning("Delete preview?", {
      action: {
        label: "Delete",
        onClick: () => setState("Preview environment deleted.")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{state}</strong>
      <span>Use a toast action for low-risk confirmation.</span>
      <button className="command-trigger" onClick={confirm}>Delete Preview</button>
    </div>
  );
}
