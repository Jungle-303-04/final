import { useState } from "react";

export default function AiHumanCheckpointExample() {
  const [approved, setApproved] = useState(false);

  return (
    <div className={approved ? "approval-dialog approved-inline" : "approval-dialog"}>
      <strong>{approved ? "Human approved" : "Human checkpoint"}</strong>
      <span>AI wants to edit tracked files.</span>
      <button className="command-trigger" onClick={() => setApproved(true)}>Approve</button>
    </div>
  );
}
