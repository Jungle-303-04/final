import { useState } from "react";
import { toast } from "sonner";

export default function SonnerSessionExpiringExample() {
  const [status, setStatus] = useState("Session active.");

  function warn() {
    toast.warning("Session expires soon", {
      action: {
        label: "Extend",
        onClick: () => setStatus("Session extended.")
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{status}</strong>
      <button className="command-trigger" onClick={warn}>Warn</button>
    </div>
  );
}
