import { useState } from "react";

export default function AiSafetyInterruptionExample() {
  const [blocked, setBlocked] = useState(true);

  return (
    <div className={blocked ? "safety-card blocked" : "safety-card"}>
      <strong>{blocked ? "승인이 필요합니다" : "승인됨"}</strong>
      <span>AI가 위험한 명령을 실행하려고 합니다.</span>
      <button className="command-trigger stable-wide" onClick={() => setBlocked(false)} type="button">안전 대안 승인</button>
    </div>
  );
}
