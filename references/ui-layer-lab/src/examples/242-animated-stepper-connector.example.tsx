import { useState } from "react";

const steps = ["계획", "패치", "검증", "배포"];

export default function AnimatedStepperConnectorExample() {
  const [active, setActive] = useState(1);

  return (
    <div className="connector-stepper">
      {steps.map((step, index) => (
        <button aria-pressed={index <= active} className={index <= active ? "active" : ""} key={step} onClick={() => setActive(index)} type="button">
          <span>{index + 1}</span>
          {step}
        </button>
      ))}
    </div>
  );
}
