import { useState } from "react";
import { toast } from "sonner";

export default function SonnerProgressWithActionExample() {
  const [progress, setProgress] = useState(35);

  function advance() {
    setProgress((value) => Math.min(100, value + 25));
    toast.info("Upload progress updated", { description: "Artifact bundle is still available in the job tray." });
  }

  return (
    <div className="toast-state-card">
      <strong>Artifact upload {progress}%</strong>
      <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
      <button className="command-trigger" onClick={advance}>Advance Upload</button>
    </div>
  );
}
