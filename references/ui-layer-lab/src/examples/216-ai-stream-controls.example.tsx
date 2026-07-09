import { useState } from "react";

export default function AiStreamControlsExample() {
  const [paused, setPaused] = useState(false);
  const text = paused ? "Streaming paused." : "Generating explanation for the failed deployment...";

  return (
    <div className="ai-chat-card">
      <strong>Assistant stream</strong>
      <span>{text}</span>
      <button className="command-trigger" onClick={() => setPaused((value) => !value)}>{paused ? "Resume" : "Pause"}</button>
    </div>
  );
}
