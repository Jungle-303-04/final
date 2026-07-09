import { useState } from "react";

const steps = ["Plan", "Patch", "Verify", "Ship"];

export default function AnimatedStepperConnectorExample() {
  const [active, setActive] = useState(1);

  return (
    <div className="connector-stepper">
      {steps.map((step, index) => (
        <button className={index <= active ? "active" : ""} key={step} onClick={() => setActive(index)}>
          <span>{index + 1}</span>
          {step}
        </button>
      ))}
    </div>
  );
}
