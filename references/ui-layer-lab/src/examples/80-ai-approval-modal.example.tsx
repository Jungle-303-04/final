import { useState } from "react";

export default function AiApprovalModalExample() {
  const [open, setOpen] = useState(false);
  const [approved, setApproved] = useState(false);

  return (
    <div className="example-stack">
      <button className="command-trigger" onClick={() => setOpen(true)}>
        Request Tool Approval
      </button>
      <span className="muted">{approved ? "Approved" : "Waiting"}</span>
      {open ? (
        <div className="approval-layer">
          <button className="approval-backdrop" onClick={() => setOpen(false)} />
          <section className="approval-dialog">
            <strong>Allow AI to run git diff?</strong>
            <span>The command reads local changes and returns a summary.</span>
            <div className="tool-call-actions">
              <button onClick={() => setOpen(false)}>Deny</button>
              <button
                onClick={() => {
                  setApproved(true);
                  setOpen(false);
                }}
              >
                Allow
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
