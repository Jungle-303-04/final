import { toast } from "sonner";
import { useState } from "react";

export default function SonnerCustomMetadataCardExample() {
  const [status, setStatus] = useState("No run opened");

  function showCard() {
    toast.custom((id) => (
      <div className="custom-toast">
        <strong>deploy-preview-42</strong>
        <span>3 checks passed, 1 visual diff</span>
        <button onClick={() => { setStatus("Opened deploy-preview-42"); toast.dismiss(id); }}>Open run</button>
      </div>
    ));
  }

  return (
    <div className="toast-state-card">
      <strong>{status}</strong>
      <button className="command-trigger" onClick={showCard}>Show Metadata Toast</button>
    </div>
  );
}
