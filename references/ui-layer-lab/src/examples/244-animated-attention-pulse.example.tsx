import { useState } from "react";

export default function AnimatedAttentionPulseExample() {
  const [alert, setAlert] = useState(false);

  return (
    <div className={alert ? "attention-card alert" : "attention-card"}>
      <strong>{alert ? "확인이 필요합니다" : "문제 없음"}</strong>
      <span>펄스는 잠깐 주의를 끌어야 할 때만 사용합니다.</span>
      <button aria-pressed={alert} className="command-trigger stable-wide" onClick={() => setAlert((value) => !value)} type="button">
        알림 전환
      </button>
    </div>
  );
}
