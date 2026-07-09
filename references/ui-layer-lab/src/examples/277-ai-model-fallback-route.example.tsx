import { useState } from "react";

const routes = ["fast model", "reasoning model", "fallback model"];

export default function AiModelFallbackRouteExample() {
  const [route, setRoute] = useState(0);

  return (
    <div className="agent-steps">
      <button className="command-trigger" onClick={() => setRoute((value) => (value + 1) % routes.length)}>Fallback</button>
      {routes.map((item, index) => (
        <div className={index === route ? "agent-step active" : "agent-step"} key={item}>
          <span>{index + 1}</span>
          <strong>{item}</strong>
        </div>
      ))}
    </div>
  );
}
