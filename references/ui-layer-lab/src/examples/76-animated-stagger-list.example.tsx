import { useState } from "react";

const steps = ["Fetch origin", "Install dependencies", "Run typecheck", "Build preview", "Smoke test"];

export default function AnimatedStaggerListExample() {
  const [run, setRun] = useState(0);

  return (
    <div className="animated-stagger">
      <button className="command-trigger" onClick={() => setRun((value) => value + 1)}>
        Replay
      </button>
      {steps.map((step, index) => (
        <div className="stagger-row" key={`${run}-${step}`} style={{ animationDelay: `${index * 80}ms` }}>
          <span>{index + 1}</span>
          <strong>{step}</strong>
        </div>
      ))}
    </div>
  );
}
