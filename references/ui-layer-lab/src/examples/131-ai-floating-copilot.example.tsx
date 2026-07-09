import { useState } from "react";

export default function AiFloatingCopilotExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fake-page">
      <strong>Current app screen</strong>
      <p>The copilot floats above the page without changing route.</p>
      <button className="copilot-button" onClick={() => setOpen((value) => !value)}>AI</button>
      {open ? (
        <section className="copilot-panel">
          <strong>How can I help?</strong>
          <input placeholder="Ask about this page..." />
        </section>
      ) : null}
    </div>
  );
}
