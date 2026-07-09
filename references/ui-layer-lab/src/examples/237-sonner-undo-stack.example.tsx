import { useState } from "react";
import { toast } from "sonner";

export default function SonnerUndoStackExample() {
  const [archived, setArchived] = useState<string[]>([]);

  function archive(item: string) {
    setArchived((items) => [...items, item]);
    toast(`${item} archived`, {
      action: {
        label: "Undo",
        onClick: () => setArchived((items) => items.filter((entry) => entry !== item))
      }
    });
  }

  return (
    <div className="toast-state-card">
      <strong>{archived.length} archived</strong>
      <button className="command-trigger" onClick={() => archive(`run-${archived.length + 1}`)}>Archive Run</button>
    </div>
  );
}
