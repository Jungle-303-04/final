import { useState } from "react";
import { toast } from "sonner";

const checks = ["lint", "typecheck", "build"];

export default function SonnerProgressChecklistExample() {
  const [done, setDone] = useState(1);

  function advance() {
    const next = done >= checks.length ? 1 : done + 1;
    setDone(next);
    toast.info(`${next}/${checks.length} checks complete`);
  }

  return (
    <div className="checkpoint-card">
      <button className="command-trigger" onClick={advance}>Advance Check</button>
      <div className="checkpoint-row">
        {checks.map((check, index) => <span className={index < done ? "active" : ""} key={check}>{check}</span>)}
      </div>
    </div>
  );
}
