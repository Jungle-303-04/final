import { useState } from "react";

export default function AnimatedOptimisticRowExample() {
  const [saved, setSaved] = useState(false);

  return (
    <div className={saved ? "optimistic-row saved" : "optimistic-row"}>
      <strong>settings.json</strong>
      <span aria-live="polite" className="stable-text-slot">{saved ? "저장됨" : "수정됨"}</span>
      <button className="command-trigger stable-wide" onClick={() => setSaved(true)} type="button">저장</button>
    </div>
  );
}
