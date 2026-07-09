import { useState } from "react";
import { toast } from "sonner";

const events = ["queued", "running", "complete"];

export default function SonnerCenterQueueCardExample() {
  const [count, setCount] = useState(0);

  function push() {
    const next = events[count % events.length];
    setCount((value) => value + 1);
    toast(next);
  }

  return (
    <div className="toast-state-card">
      <strong>{count} events pushed</strong>
      <button className="command-trigger" onClick={push}>Push Queue Event</button>
    </div>
  );
}
