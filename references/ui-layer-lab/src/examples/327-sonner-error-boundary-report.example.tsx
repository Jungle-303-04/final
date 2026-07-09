import { useState } from "react";
import { toast } from "sonner";

export default function SonnerErrorBoundaryReportExample() {
  const [status, setStatus] = useState("No report.");

  function report() {
    setStatus("Report sent: UI-502");
    toast.error("Renderer crashed", { description: "Report UI-502 was attached to the run." });
  }

  return (
    <div className="toast-state-card">
      <strong>{status}</strong>
      <button className="command-trigger" onClick={report}>Report Error</button>
    </div>
  );
}
