import { useState } from "react";

export default function JobSecretMaskExample() {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="terminal-log secret-log">
      <code>DATABASE_URL={revealed ? "postgres://preview-db" : "••••••••••••"}</code>
      <code>OPENAI_API_KEY=••••••••••••</code>
      <button aria-pressed={revealed} className="command-trigger stable-wide" onClick={() => setRevealed((value) => !value)} type="button">
        {revealed ? "값 마스킹" : "안전 값 표시"}
      </button>
    </div>
  );
}
