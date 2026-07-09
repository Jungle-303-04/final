import { useState } from "react";

export default function JobApprovalGateBannerExample() {
  const [approved, setApproved] = useState(false);

  return (
    <div className={approved ? "sla-card gate-card approved" : "sla-card gate-card"}>
      <strong>{approved ? "Deployment approved" : "Approval required"}</strong>
      <span>{approved ? "Production gate is open." : "A reviewer must approve before publish."}</span>
      <button className="command-trigger" onClick={() => setApproved(true)}>Approve Gate</button>
    </div>
  );
}
