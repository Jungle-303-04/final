import { useState } from "react";

const steps = ["라우트 표 읽기", "워크플로 로그 열기", "실패 assertion 찾기", "수정안 제안"];

export default function AiAgentStepsExample() {
  const [active, setActive] = useState(0);

  function advance() {
    setActive((value) => Math.min(value + 1, steps.length - 1));
  }

  return (
    <div className="agent-steps">
      {steps.map((step, index) => (
        <div className={`agent-step ${index <= active ? "active" : ""}`} key={step}>
          <span>{index + 1}</span>
          <strong>{step}</strong>
        </div>
      ))}
      <button className="command-trigger stable-wide" onClick={advance} type="button">
        다음 단계
      </button>
    </div>
  );
}
