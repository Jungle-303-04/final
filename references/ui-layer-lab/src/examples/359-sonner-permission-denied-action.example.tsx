import { useState } from "react";
import { toast } from "sonner";

export default function SonnerPermissionDeniedActionExample() {
  const [status, setStatus] = useState("No request");

  function deny() {
    setStatus("Request ready");
    toast.error("Permission denied", {
      action: { label: "Request", onClick: () => setStatus("Access requested") }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{status}</strong>
      <button className="command-trigger" onClick={deny}>Run Protected Action</button>
    </div>
  );
}
