import { useState } from "react";
import { toast } from "sonner";

export default function SonnerOptimisticSaveExample() {
  const [status, setStatus] = useState("Draft has local edits.");

  function save() {
    setStatus("Saved locally. Syncing remote...");
    const id = toast.loading("Saving draft...");
    window.setTimeout(() => {
      toast.success("Draft saved", { id });
      setStatus("Remote save completed.");
    }, 900);
  }

  return (
    <div className="toast-state-card">
      <strong>Optimistic save</strong>
      <span>{status}</span>
      <button className="command-trigger" onClick={save}>Save Draft</button>
    </div>
  );
}
