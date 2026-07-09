import { useState } from "react";

const steps = ["Reading diff", "Checking logs", "Mapping failure", "Drafting answer"];

export default function AiReasoningProgressExample() {
  const [step, setStep] = useState(1);

  return (
    <div className="agent-steps">
      {steps.map((item, index) => (
        <div className={`agent-step ${index <= step ? "active" : ""}`} key={item}>
          <span>{index + 1}</span>
          <strong>{item}</strong>
        </div>
      ))}
      <button className="command-trigger" onClick={() => setStep((value) => Math.min(value + 1, steps.length - 1))}>
        Continue
      </button>
    </div>
  );
}
