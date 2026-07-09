import { useState } from "react";

export default function AnimatedStatusRibbonExample() {
  const [live, setLive] = useState(false);

  return (
    <div className={live ? "ribbon-card live" : "ribbon-card"}>
      <span aria-live="polite" className="stable-text-slot">{live ? "실시간" : "대기"}</span>
      <strong>미리보기 환경</strong>
      <button aria-pressed={live} className="command-trigger stable-wide" onClick={() => setLive((value) => !value)} type="button">
        상태 전환
      </button>
    </div>
  );
}
