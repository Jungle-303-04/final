import { useState } from "react";
import { toast } from "sonner";

export default function SonnerMutedChannelExample() {
  const [muted, setMuted] = useState(false);
  const [log, setLog] = useState("No silent events.");

  function notify() {
    if (muted) {
      setLog("Stored in activity log.");
      return;
    }
    toast.success("Visible toast channel");
    setLog("Toast shown.");
  }

  return (
    <div className="toast-state-card">
      <button className="command-trigger" onClick={() => setMuted((value) => !value)}>{muted ? "Unmute Toasts" : "Mute Toasts"}</button>
      <button className="command-trigger" onClick={notify}>Notify</button>
      <span>{log}</span>
    </div>
  );
}
