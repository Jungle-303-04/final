import { useEffect, useState } from "react";

export default function JobCancelActionExample() {
  const [status, setStatus] = useState<"running" | "cancelled" | "success">("running");
  const [progress, setProgress] = useState(18);
  const statusLabel = {
    running: "실행 중",
    cancelled: "취소됨",
    success: "완료"
  }[status];

  useEffect(() => {
    if (status !== "running") return;

    const timer = window.setInterval(() => {
      setProgress((value) => {
        const next = Math.min(value + 8, 100);
        if (next === 100) setStatus("success");
        return next;
      });
    }, 500);

    return () => window.clearInterval(timer);
  }, [status]);

  return (
    <div className="job-strip">
      <strong>git push</strong>
      <div className="progress-track">
        <div style={{ width: `${progress}%` }} />
      </div>
      {status === "running" ? (
        <button onClick={() => setStatus("cancelled")} type="button">취소</button>
      ) : (
        <span>{statusLabel}</span>
      )}
    </div>
  );
}
