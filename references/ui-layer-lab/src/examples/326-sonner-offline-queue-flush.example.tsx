import { useState } from "react";
import { toast } from "sonner";

export default function SonnerOfflineQueueFlushExample() {
  const [queued, setQueued] = useState(3);

  function flush() {
    setQueued(0);
    toast.success("Queued events flushed", { description: "3 background updates were delivered." });
  }

  return (
    <div className="toast-state-card">
      <strong>{queued} offline events</strong>
      <button className="command-trigger" onClick={flush}>Flush Queue</button>
    </div>
  );
}
