import { useState } from "react";

export default function AiToolResultCardExample() {
  const [result, setResult] = useState("Tool has not run.");

  return (
    <div className="tool-call-card">
      <strong>Tool call</strong>
      <code>git diff -- src/App.tsx</code>
      <span>{result}</span>
      <div className="tool-call-actions">
        <button onClick={() => setResult("Tool returned 2 changed hunks.")}>Run</button>
        <button onClick={() => setResult("Result attached to chat.")}>Attach</button>
      </div>
    </div>
  );
}
