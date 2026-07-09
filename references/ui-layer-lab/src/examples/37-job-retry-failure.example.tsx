import { useState } from "react";

export default function JobRetryFailureExample() {
  const [status, setStatus] = useState<"failed" | "queued" | "running" | "success">("failed");
  const statusLabel = {
    failed: "실패",
    queued: "대기",
    running: "실행 중",
    success: "성공"
  }[status];

  function retry() {
    setStatus("queued");
    window.setTimeout(() => setStatus("running"), 500);
    window.setTimeout(() => setStatus("success"), 1500);
  }

  return (
    <div className={`retry-card ${status}`}>
      <strong>시각 스모크</strong>
      <span>{statusLabel}</span>
      <button className="command-trigger stable-wide" onClick={retry} type="button">
        다시 시도
      </button>
    </div>
  );
}
