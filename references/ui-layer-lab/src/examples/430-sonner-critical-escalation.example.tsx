import { toast } from "sonner";
import { useState } from "react";

export default function SonnerCriticalEscalationExample() {
  const [level, setLevel] = useState("normal");

  function escalate() {
    setLevel("critical");
    toast.error("Critical job failure", { description: "Escalated to release owner." });
  }

  return (
    <div className={level === "critical" ? "pause-card paused" : "pause-card"}>
      <strong>{level}</strong>
      <span>Notification escalation level</span>
      <button className="command-trigger" onClick={escalate}>Escalate</button>
    </div>
  );
}
