import { useState } from "react";

export default function JobRetryFailureExample() {
  const [status, setStatus] = useState<"failed" | "queued" | "running" | "success">("failed");

  function retry() {
    setStatus("queued");
    window.setTimeout(() => setStatus("running"), 500);
    window.setTimeout(() => setStatus("success"), 1500);
  }

  return (
    <div className={`retry-card ${status}`}>
      <strong>visual smoke</strong>
      <span>{status}</span>
      <button className="command-trigger" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
