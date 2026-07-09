import { useState } from "react";

const steps = [
  { label: "Checkout", detail: "Repository checked out successfully." },
  { label: "Install", detail: "Dependencies restored from cache." },
  { label: "Build", detail: "Frontend bundle completed." },
  { label: "Visual Smoke", detail: "Route assertion failed." }
];

export default function StepperDrilldownExample() {
  const [active, setActive] = useState(3);

  return (
    <div className="stepper-demo">
      <div className="stepper-list">
        {steps.map((step, index) => (
          <button className={index === active ? "active" : ""} key={step.label} onClick={() => setActive(index)}>
            <span>{index + 1}</span>
            {step.label}
          </button>
        ))}
      </div>
      <div className="detail-panel">
        <strong>{steps[active].label}</strong>
        <span>{steps[active].detail}</span>
      </div>
    </div>
  );
}
