import { useState } from "react";

export default function AnimatedModalFocusTrapExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="example-stack">
      <button className="command-trigger" onClick={() => setOpen(true)}>Open Modal</button>
      {open ? (
        <div className="approval-layer" role="dialog" aria-modal="true">
          <button className="approval-backdrop" aria-label="Dismiss overlay" onClick={() => setOpen(false)} />
          <section className="approval-dialog">
            <strong>Confirm AI edit</strong>
            <span>Focus stays inside the top layer until closed.</span>
            <button className="command-trigger" onClick={() => setOpen(false)}>Close Modal</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
