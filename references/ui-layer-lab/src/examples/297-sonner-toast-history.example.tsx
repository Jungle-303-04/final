import { useState } from "react";
import { toast } from "sonner";

const events = ["Pull completed", "Typecheck started", "Preview deployed"];

export default function SonnerToastHistoryExample() {
  const [history, setHistory] = useState<string[]>([]);

  function pushEvent() {
    const next = events[history.length % events.length];
    setHistory((items) => [next, ...items].slice(0, 3));
    toast(next);
  }

  return (
    <div className="toast-state-card">
      <button className="command-trigger" onClick={pushEvent}>Push Event</button>
      <div className="stack-list">
        {history.map((item) => <button key={item}>{item}</button>)}
      </div>
    </div>
  );
}
