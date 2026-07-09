import { useState } from "react";

export default function AnimatedHeightRevealExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="height-reveal-card">
      <button className="command-trigger" onClick={() => setOpen((value) => !value)}>{open ? "Hide Detail" : "Reveal Detail"}</button>
      <section className={open ? "height-reveal open" : "height-reveal"}>
        <strong>Expanded job detail</strong>
        <span>Shows logs, artifacts, and retry hints without leaving the current page.</span>
      </section>
    </div>
  );
}
