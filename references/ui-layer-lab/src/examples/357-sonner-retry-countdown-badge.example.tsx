import { useState } from "react";
import { toast } from "sonner";

export default function SonnerRetryCountdownBadgeExample() {
  const [retry, setRetry] = useState(3);

  function tick() {
    setRetry((value) => Math.max(0, value - 1));
    toast.warning(`Retry in ${retry - 1}s`);
  }

  return (
    <div className="toast-state-card">
      <strong>Retry countdown {retry}s</strong>
      <button className="command-trigger" onClick={tick}>Tick Retry</button>
    </div>
  );
}
