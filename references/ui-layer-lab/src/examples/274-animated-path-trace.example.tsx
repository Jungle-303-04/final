import { useState } from "react";

export default function AnimatedPathTraceExample() {
  const [active, setActive] = useState(true);

  return (
    <div className="path-trace-card">
      <svg viewBox="0 0 360 160" aria-hidden="true">
        <path className={active ? "tracing" : ""} d="M24 120 C90 20 150 20 208 92 S300 154 336 42" />
      </svg>
      <button className="command-trigger" onClick={() => setActive((value) => !value)}>{active ? "Pause" : "Trace"}</button>
    </div>
  );
}
