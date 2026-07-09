import { useState } from "react";

export default function AiTokenBudgetMeterExample() {
  const [tokens, setTokens] = useState(4200);
  const percent = Math.round((tokens / 8000) * 100);

  return (
    <div className="resource-meter">
      <section>
        <strong>Token budget</strong>
        <div className="progress-track"><div style={{ width: `${percent}%` }} /></div>
        <span>{tokens}</span>
      </section>
      <button className="command-trigger" onClick={() => setTokens((value) => Math.min(8000, value + 900))}>Add Context</button>
    </div>
  );
}
