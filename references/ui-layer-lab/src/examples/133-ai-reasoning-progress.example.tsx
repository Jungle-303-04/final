import { useState } from "react";

const steps = ["변경사항 읽기", "로그 확인", "실패 원인 매핑", "답변 초안 작성"];

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
      <button className="command-trigger stable-wide" onClick={() => setStep((value) => Math.min(value + 1, steps.length - 1))} type="button">
        계속
      </button>
    </div>
  );
}
