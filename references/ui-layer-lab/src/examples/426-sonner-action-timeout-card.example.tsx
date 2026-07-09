import { toast } from "sonner";
import { useState } from "react";

export default function SonnerActionTimeoutCardExample() {
  const [seconds, setSeconds] = useState(5);

  function tick() {
    const next = Math.max(0, seconds - 1);
    setSeconds(next);
    toast.warning(`Action expires in ${next}s`);
  }

  return (
    <div className="toast-state-card">
      <strong>{seconds}s remaining</strong>
      <button className="command-trigger" onClick={tick}>Tick Timeout</button>
    </div>
  );
}
