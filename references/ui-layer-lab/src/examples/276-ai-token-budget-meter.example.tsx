import { useState } from "react";

export default function AiTokenBudgetMeterExample() {
  const [tokens, setTokens] = useState(4200);
  const percent = Math.round((tokens / 8000) * 100);

  return (
    <div className="resource-meter">
      <section>
        <strong>토큰 예산</strong>
        <div className="progress-track"><div style={{ width: `${percent}%` }} /></div>
        <span aria-live="polite">{tokens} 토큰</span>
      </section>
      <button className="command-trigger stable-wide" onClick={() => setTokens((value) => Math.min(8000, value + 900))} type="button">
        컨텍스트 추가
      </button>
    </div>
  );
}
