import { useState } from "react";

export default function JobPausedStateExample() {
  const [paused, setPaused] = useState(true);

  return (
    <div className={`pause-card ${paused ? "paused" : ""}`}>
      <strong>{paused ? "Paused" : "Running"}</strong>
      <span>{paused ? "Waiting for approval." : "Job resumed."}</span>
      <button className="command-trigger" onClick={() => setPaused((value) => !value)}>
        {paused ? "Resume" : "Pause"}
      </button>
    </div>
  );
}
