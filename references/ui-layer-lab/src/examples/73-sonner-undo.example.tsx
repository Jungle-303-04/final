import { toast } from "sonner";
import { useState } from "react";

export default function SonnerUndoExample() {
  const [archived, setArchived] = useState(false);

  function archive() {
    setArchived(true);
    toast("Run archived", {
      action: {
        label: "Undo",
        onClick: () => setArchived(false)
      }
    });
  }

  return (
    <div className="example-stack">
      <button className="command-trigger" onClick={archive}>
        Archive Run
      </button>
      <span className="muted">{archived ? "Archived" : "Visible"}</span>
    </div>
  );
}
