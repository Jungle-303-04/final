import { useState } from "react";
const messages = [
  { role: "user", text: "Why did the latest run fail?" },
  { role: "assistant", text: "The visual smoke step expected a route that is no longer mounted." }
];

export default function AssistantDrawerExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="split-demo">
      <div className="fake-page">
        <strong>Deploy Preview</strong>
        <p>Quality checks failed in visual smoke.</p>
        <button className="primary-button" onClick={() => setOpen(true)}>
          Open assistant
        </button>
      </div>

      {open ? (
        <aside className="drawer">
          <div className="drawer-header">
            <strong>AI Assistant</strong>
            <button onClick={() => setOpen(false)}>Close</button>
          </div>
          {messages.map((message) => (
            <article className={`chat-message ${message.role}`} key={message.text}>
              {message.text}
            </article>
          ))}
          <div className="context-card">
            Context: Deploy Preview / Visual smoke / failed
          </div>
        </aside>
      ) : null}
    </div>
  );
}
