import { useState } from "react";

export default function AiInlineCitationPopoverExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="citation-popover-card">
      <p>
        The preview route returned 404{" "}
        <button onClick={() => setOpen((value) => !value)}>[source]</button>
      </p>
      {open ? (
        <aside>
          <strong>workflow.log</strong>
          <span>GET /preview returned 404 during visual smoke.</span>
        </aside>
      ) : null}
    </div>
  );
}
