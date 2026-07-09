import { useEffect, useState } from "react";

export default function JobSlaAlertExample() {
  const [seconds, setSeconds] = useState(7);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={`sla-card ${seconds === 0 ? "expired" : ""}`}>
      <strong>{seconds === 0 ? "SLA breached" : `${seconds}s remaining`}</strong>
      <span>Escalate if deploy does not finish.</span>
    </div>
  );
}
