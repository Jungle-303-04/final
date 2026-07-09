import { useState } from "react";

export default function AiFloatingTranscriptPanelExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="fake-page">
      <strong>Current UI</strong>
      <p>AI transcript can float above this surface.</p>
      <button className="command-trigger" onClick={() => setOpen((value) => !value)}>{open ? "Hide Transcript" : "Show Transcript"}</button>
      {open ? (
        <aside className="floating-job-center">
          <strong>AI transcript</strong>
          <span>User asked about workflow logs.</span>
        </aside>
      ) : null}
    </div>
  );
}
