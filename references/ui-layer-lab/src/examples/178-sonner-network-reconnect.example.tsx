import { useState } from "react";
import { toast } from "sonner";

export default function SonnerNetworkReconnectExample() {
  const [online, setOnline] = useState(true);

  function toggle() {
    setOnline((value) => {
      toast(value ? "You are offline" : "Connection restored", {
        description: value ? "Background jobs will pause." : "Queued jobs are resuming."
      });
      return !value;
    });
  }

  return (
    <div className={`pause-card ${online ? "" : "paused"}`}>
      <strong>{online ? "Online" : "Offline"}</strong>
      <span>{online ? "Realtime updates are active." : "Waiting for reconnect."}</span>
      <button className="command-trigger" onClick={toggle}>{online ? "Go Offline" : "Reconnect"}</button>
    </div>
  );
}
