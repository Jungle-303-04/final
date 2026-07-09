import { useState } from "react";

const variants = {
  A: "Explain the failure briefly.",
  B: "Explain failure, evidence, and next action."
};

export default function AiPromptAbTestExample() {
  const [variant, setVariant] = useState<keyof typeof variants>("A");

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {Object.keys(variants).map((item) => <button className={variant === item ? "active" : ""} key={item} onClick={() => setVariant(item as keyof typeof variants)}>Variant {item}</button>)}
      </div>
      <div className="animated-tab-panel">
        <strong>Prompt {variant}</strong>
        <span>{variants[variant]}</span>
      </div>
    </div>
  );
}
