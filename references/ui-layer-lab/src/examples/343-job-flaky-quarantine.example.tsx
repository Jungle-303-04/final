import { useState } from "react";

export default function JobFlakyQuarantineExample() {
  const [quarantined, setQuarantined] = useState(false);

  return (
    <div className={quarantined ? "sla-card gate-card quarantine" : "sla-card gate-card"}>
      <strong>visual-smoke.spec.ts</strong>
      <span>{quarantined ? "Quarantined from release gate." : "3 failures in 10 runs."}</span>
      <button className="command-trigger" onClick={() => setQuarantined(true)}>Quarantine</button>
    </div>
  );
}
