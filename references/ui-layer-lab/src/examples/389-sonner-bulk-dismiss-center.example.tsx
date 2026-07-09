import { toast } from "sonner";
import { useState } from "react";

export default function SonnerBulkDismissCenterExample() {
  const [count, setCount] = useState(0);

  function pushToast() {
    const next = count + 1;
    setCount(next);
    toast(`Background event ${next}`);
  }

  function dismissAll() {
    toast.dismiss();
    setCount(0);
  }

  return (
    <div className="toast-state-card">
      <strong>{count} visible events</strong>
      <div className="tool-call-actions">
        <button onClick={pushToast}>Push Event</button>
        <button onClick={dismissAll}>Dismiss All</button>
      </div>
    </div>
  );
}
