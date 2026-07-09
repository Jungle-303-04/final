import { useState } from "react";
import { toast } from "sonner";

export default function SonnerDeploySummaryCardExample() {
  const [shown, setShown] = useState(false);

  function show() {
    setShown(true);
    toast.custom(() => (
      <div className="custom-toast">
        <strong>Deploy summary</strong>
        <span>3 jobs passed, 1 warning, 2 artifacts published.</span>
      </div>
    ));
  }

  return (
    <div className="toast-state-card">
      <button className="command-trigger" onClick={show}>Show Summary</button>
      <span>{shown ? "Summary toast rendered." : "Ready to render summary."}</span>
    </div>
  );
}
