import { useState } from "react";
import { toast } from "sonner";

export default function SonnerSilentModeExample() {
  const [silent, setSilent] = useState(false);
  const [log, setLog] = useState("Toast channel is active.");

  function notify() {
    if (silent) {
      setLog("Notification captured silently.");
      return;
    }
    toast.info("Visible notification");
  }

  return (
    <div className="toast-state-card">
      <strong>{silent ? "Silent mode" : "Visible mode"}</strong>
      <span>{log}</span>
      <button className="command-trigger" onClick={() => setSilent((value) => !value)}>Toggle Silent</button>
      <button className="command-trigger" onClick={notify}>Notify</button>
    </div>
  );
}
