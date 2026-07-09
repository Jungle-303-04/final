import { toast } from "sonner";
import { useState } from "react";

const positions = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const;

export default function SonnerPositionGridSyncExample() {
  const [position, setPosition] = useState<(typeof positions)[number]>("bottom-right");

  function show(next: (typeof positions)[number]) {
    setPosition(next);
    toast.info(`Toast at ${next}`, { position: next });
  }

  return (
    <div className="animated-tabs-card">
      <div className="animated-tabs-list">
        {positions.map((item) => (
          <button className={position === item ? "active" : ""} key={item} onClick={() => show(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="animated-tab-panel">
        <strong>{position}</strong>
        <span>Position state mirrors the Sonner option</span>
      </div>
    </div>
  );
}
