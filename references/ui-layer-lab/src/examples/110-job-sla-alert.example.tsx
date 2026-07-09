import { useEffect, useState } from "react";

export default function JobSlaAlertExample() {
  const [seconds, setSeconds] = useState(7);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={`sla-card ${seconds === 0 ? "expired" : ""}`}>
      <strong>{seconds === 0 ? "SLA 위반" : `${seconds}초 남음`}</strong>
      <span>배포가 끝나지 않으면 담당자에게 에스컬레이션합니다.</span>
    </div>
  );
}
