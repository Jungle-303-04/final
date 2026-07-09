import { useState } from "react";

const steps = ["Read route table", "Open workflow logs", "Find failing assertion", "Suggest fix"];

export default function AiAgentStepsExample() {
  const [active, setActive] = useState(0);

  function advance() {
    setActive((value) => Math.min(value + 1, steps.length - 1));
  }

  return (
    <div className="agent-steps">
      {steps.map((step, index) => (
        <div className={`agent-step ${index <= active ? "active" : ""}`} key={step}>
          <span>{index + 1}</span>
          <strong>{step}</strong>
        </div>
      ))}
      <button className="command-trigger" onClick={advance}>
        Advance Agent
      </button>
    </div>
  );
}
