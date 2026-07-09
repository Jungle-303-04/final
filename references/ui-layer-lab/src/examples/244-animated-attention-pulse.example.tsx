import { useState } from "react";

export default function AnimatedAttentionPulseExample() {
  const [alert, setAlert] = useState(false);

  return (
    <div className={alert ? "attention-card alert" : "attention-card"}>
      <strong>{alert ? "Needs attention" : "All clear"}</strong>
      <span>Use pulse only for temporary focus.</span>
      <button className="command-trigger" onClick={() => setAlert((value) => !value)}>Toggle Alert</button>
    </div>
  );
}
