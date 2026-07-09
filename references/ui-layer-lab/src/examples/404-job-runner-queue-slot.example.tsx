import { useState } from "react";

const slots = ["runner-1", "runner-2", "runner-3"];

export default function JobRunnerQueueSlotExample() {
  const [busy, setBusy] = useState(1);

  return (
    <div className="parallel-lanes">
      {slots.map((slot, index) => (
        <section key={slot}>
          <strong>{slot}</strong>
          <span>{index <= busy ? "running" : "available"}</span>
        </section>
      ))}
      <button className="command-trigger" onClick={() => setBusy((value) => (value + 1) % slots.length)}>Rotate Slot</button>
    </div>
  );
}
