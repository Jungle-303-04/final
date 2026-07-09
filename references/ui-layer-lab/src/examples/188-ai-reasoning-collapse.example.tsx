import { useState } from "react";

const steps = ["Read workflow logs", "Compare failing step", "Draft smallest patch"];

export default function AiReasoningCollapseExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="reasoning-card">
      <button className="command-trigger" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide" : "Show"} Reasoning
      </button>
      {open ? steps.map((step, index) => (
        <div className="agent-step active" key={step}>
          <span>{index + 1}</span>
          <strong>{step}</strong>
        </div>
      )) : <span>Reasoning collapsed.</span>}
    </div>
  );
}
