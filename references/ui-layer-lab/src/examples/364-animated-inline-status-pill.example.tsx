import { useState } from "react";

const states = ["queued", "running", "done"];

export default function AnimatedInlineStatusPillExample() {
  const [index, setIndex] = useState(0);

  return (
    <div className="inline-status-card">
      <button className="command-trigger" onClick={() => setIndex((value) => (value + 1) % states.length)}>Next Status</button>
      <span className={`status-pill ${states[index]}`}>{states[index]}</span>
    </div>
  );
}
