import { useState } from "react";

export default function AnimatedCommandBarExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="command-bar-stage">
      <button className="command-trigger" onClick={() => setOpen((value) => !value)}>
        Toggle Bar
      </button>
      {open ? (
        <div className="bottom-command-bar">
          <input autoFocus placeholder="Ask AI anything..." />
          <button>Send</button>
        </div>
      ) : null}
    </div>
  );
}
