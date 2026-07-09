import { FormEvent, useState } from "react";
export default function AiQuickInputExample() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("Ask something about the current screen.");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setAnswer(`AI answer for: "${question}"`);
    setQuestion("");
    setOpen(false);
  }

  return (
    <div className="example-stack">
      <button className="primary-button" onClick={() => setOpen(true)}>
        Ask AI
      </button>
      <div className="answer-box">{answer}</div>

      {open ? (
        <div className="overlay" role="dialog" aria-modal="true">
          <button className="backdrop" aria-label="Close" onClick={() => setOpen(false)} />
          <form className="quick-input" onSubmit={submit}>
            <input
              autoFocus
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about this page..."
            />
            <button>Send</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
