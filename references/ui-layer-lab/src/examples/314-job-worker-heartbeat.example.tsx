import { useState } from "react";

export default function JobWorkerHeartbeatExample() {
  const [beat, setBeat] = useState(42);

  return (
    <div className="heartbeat-card">
      <strong>runner-07 heartbeat</strong>
      <span>{beat}s ago</span>
      <button className="command-trigger" onClick={() => setBeat((value) => (value <= 6 ? 42 : value - 6))}>Tick</button>
    </div>
  );
}
