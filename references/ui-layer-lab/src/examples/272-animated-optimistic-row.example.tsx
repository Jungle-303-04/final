import { useState } from "react";

export default function AnimatedOptimisticRowExample() {
  const [saved, setSaved] = useState(false);

  return (
    <div className={saved ? "optimistic-row saved" : "optimistic-row"}>
      <strong>settings.json</strong>
      <span>{saved ? "saved" : "dirty"}</span>
      <button className="command-trigger" onClick={() => setSaved(true)}>Save</button>
    </div>
  );
}
