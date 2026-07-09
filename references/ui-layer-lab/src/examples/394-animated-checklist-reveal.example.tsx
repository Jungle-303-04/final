import { useState } from "react";

const checks = ["Install", "Typecheck", "Build", "Smoke"];

export default function AnimatedChecklistRevealExample() {
  const [done, setDone] = useState(1);

  return (
    <div className="checkpoint-card">
      <button className="command-trigger" onClick={() => setDone((value) => (value >= checks.length ? 1 : value + 1))}>
        Advance Checklist
      </button>
      <div className="checkpoint-row">
        {checks.map((check, index) => (
          <span className={index < done ? "active" : ""} key={check}>
            {check}
          </span>
        ))}
      </div>
    </div>
  );
}
