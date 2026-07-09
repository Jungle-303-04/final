import { useState } from "react";

const routes = ["빠른 모델", "추론 모델", "대체 모델"];

export default function AiModelFallbackRouteExample() {
  const [route, setRoute] = useState(0);

  return (
    <div className="agent-steps">
      <button className="command-trigger stable-wide" onClick={() => setRoute((value) => (value + 1) % routes.length)} type="button">
        대체 경로
      </button>
      {routes.map((item, index) => (
        <div aria-current={index === route ? "step" : undefined} className={index === route ? "agent-step active" : "agent-step"} key={item}>
          <span>{index + 1}</span>
          <strong>{item}</strong>
        </div>
      ))}
    </div>
  );
}
