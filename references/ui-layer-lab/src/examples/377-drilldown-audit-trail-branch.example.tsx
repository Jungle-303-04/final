import { useState } from "react";

const audit = {
  "10:04": "branch created",
  "10:12": "checks passed",
  "10:25": "deployment approved"
};

export default function DrilldownAuditTrailBranchExample() {
  const [time, setTime] = useState<keyof typeof audit>("10:12");

  return (
    <div className="timeline-drill">
      <div className="timeline-list">
        {Object.keys(audit).map((item) => <button className={time === item ? "active" : ""} key={item} onClick={() => setTime(item as keyof typeof audit)}><time>{item}</time>{audit[item as keyof typeof audit]}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>{time}</strong>
        <span>{audit[time]}</span>
      </aside>
    </div>
  );
}
