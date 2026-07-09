import { useState } from "react";

export default function AnimatedCommandMenuEnterExitExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="command-pop-stage">
      <button className="command-trigger" onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Open"}</button>
      {open ? (
        <div className="command-pop-card">
          <strong>Command Palette</strong>
          <span>Search or run an action...</span>
        </div>
      ) : null}
    </div>
  );
}
