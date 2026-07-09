import { useState } from "react";

export default function JobSecretMaskExample() {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="terminal-log secret-log">
      <code>DATABASE_URL={revealed ? "postgres://preview-db" : "••••••••••••"}</code>
      <code>OPENAI_API_KEY=••••••••••••</code>
      <button className="command-trigger" onClick={() => setRevealed((value) => !value)}>{revealed ? "Mask" : "Reveal"} Safe Value</button>
    </div>
  );
}
