import { useState } from "react";

export default function AnimatedSidebarPeekExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className={open ? "sidebar-peek open" : "sidebar-peek"}>
      <button className="command-trigger" onClick={() => setOpen((value) => !value)}>{open ? "Hide" : "Peek"}</button>
      <aside>
        <strong>Context</strong>
        <span>Files, logs, and AI notes.</span>
      </aside>
    </div>
  );
}
