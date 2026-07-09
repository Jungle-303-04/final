import { useState } from "react";
import { toast } from "sonner";

export default function SonnerThrottledEventsExample() {
  const [count, setCount] = useState(0);

  function pushEvent() {
    setCount((value) => {
      const next = value + 1;
      toast.info(`${next} events batched`, { id: "event-batch" });
      return next;
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{count} incoming events</strong>
      <button className="command-trigger" onClick={pushEvent}>Push Event</button>
    </div>
  );
}
