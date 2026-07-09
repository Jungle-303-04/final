import { useState } from "react";

const steps = ["Inspect state", "Patch files", "Run checks"];

export default function AiAgentStepEditorExample() {
  const [active, setActive] = useState(steps[1]);

  return (
    <div className="agent-steps">
      {steps.map((step, index) => (
        <div className={active === step ? "agent-step active" : "agent-step"} key={step} onClick={() => setActive(step)}>
          <span>{index + 1}</span>{step}
        </div>
      ))}
      <strong>Editing: {active}</strong>
    </div>
  );
}
