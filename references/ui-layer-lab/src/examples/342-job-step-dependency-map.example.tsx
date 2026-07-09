import { useState } from "react";

const steps = ["install", "typecheck", "build", "smoke"];

export default function JobStepDependencyMapExample() {
  const [active, setActive] = useState("build");

  return (
    <div className="dependency-map">
      {steps.map((step, index) => (
        <button className={active === step ? "active" : ""} key={step} onClick={() => setActive(step)}>
          <span>{index === 0 ? "root" : steps[index - 1]}</span>{step}
        </button>
      ))}
      <strong>{active} depends on previous step</strong>
    </div>
  );
}
