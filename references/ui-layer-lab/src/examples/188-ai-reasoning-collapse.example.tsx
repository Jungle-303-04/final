import { useState } from "react";

const steps = ["워크플로 로그 읽기", "실패 단계 비교", "가장 작은 패치 초안 작성"];

export default function AiReasoningCollapseExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="reasoning-card">
      <button aria-expanded={open} className="command-trigger stable-wide" onClick={() => setOpen((value) => !value)} type="button">
        {open ? "추론 접기" : "추론 보기"}
      </button>
      {open ? steps.map((step, index) => (
        <div className="agent-step active" key={step}>
          <span>{index + 1}</span>
          <strong>{step}</strong>
        </div>
      )) : <span>추론 단계가 접혔습니다.</span>}
    </div>
  );
}
