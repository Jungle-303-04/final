import { toast } from "sonner";
import { useState } from "react";

export default function SonnerPromiseStageCardExample() {
  const [stage, setStage] = useState("Idle");

  function runPromise() {
    setStage("Loading");
    toast.promise(new Promise((resolve) => setTimeout(resolve, 600)), {
      loading: "Publishing artifact...",
      success: "Artifact published",
      error: "Publish failed"
    });
    window.setTimeout(() => setStage("Success"), 650);
  }

  return (
    <div className="toast-state-card">
      <strong>{stage}</strong>
      <span>Promise toast controls the visible job stage</span>
      <button className="command-trigger" onClick={runPromise}>Publish Artifact</button>
    </div>
  );
}
