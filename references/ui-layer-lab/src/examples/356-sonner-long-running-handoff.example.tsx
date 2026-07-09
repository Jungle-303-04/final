import { useState } from "react";
import { toast } from "sonner";

export default function SonnerLongRunningHandoffExample() {
  const [state, setState] = useState("Idle");

  function start() {
    setState("Moved to job tray");
    toast.info("Long job moved to tray", { description: "You can keep working while it runs." });
  }

  return (
    <div className="toast-state-card">
      <strong>{state}</strong>
      <button className="command-trigger" onClick={start}>Start Long Job</button>
    </div>
  );
}
