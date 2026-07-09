import { useState } from "react";
import { toast } from "sonner";

export default function SonnerRateLimitExample() {
  const [remaining, setRemaining] = useState(3);

  function run() {
    setRemaining((value) => {
      if (value <= 1) {
        toast.error("Rate limit reached", { description: "Try again after the current run finishes." });
        return 0;
      }
      toast.info(`${value - 1} attempts remaining`);
      return value - 1;
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{remaining} attempts remaining</strong>
      <button className="command-trigger" onClick={run}>Run Action</button>
    </div>
  );
}
