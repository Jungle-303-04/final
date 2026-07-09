import { useState } from "react";
import { toast } from "sonner";

export default function SonnerUploadProgressExample() {
  const [progress, setProgress] = useState(0);

  function upload() {
    const id = toast.loading("Uploading artifact...");
    [25, 55, 82, 100].forEach((value, index) => {
      window.setTimeout(() => {
        setProgress(value);
        toast(value === 100 ? "Upload complete" : `Uploading ${value}%`, { id });
      }, index * 450);
    });
  }

  return (
    <div className="toast-state-card">
      <strong>Artifact upload</strong>
      <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
      <button className="command-trigger" onClick={upload}>Upload</button>
    </div>
  );
}
