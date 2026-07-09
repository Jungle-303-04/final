import { useState } from "react";
import { toast } from "sonner";

export default function SonnerCopyableLogIdExample() {
  const [copied, setCopied] = useState("Not copied");

  function show() {
    toast("Log bundle ready", {
      description: "id: log-7f31",
      action: { label: "Copy ID", onClick: () => setCopied("Copied log-7f31") }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{copied}</strong>
      <button className="command-trigger" onClick={show}>Show Log ID</button>
    </div>
  );
}
