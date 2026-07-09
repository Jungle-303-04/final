import { useState } from "react";

export default function AnimatedDragThresholdCardExample() {
  const [approved, setApproved] = useState(false);

  return (
    <div className="drag-stage">
      <button className={approved ? "drag-card dragging" : "drag-card"} onClick={() => setApproved((value) => !value)}>
        <strong>{approved ? "Threshold met" : "Drag threshold"}</strong>
        <span>Click to simulate</span>
      </button>
    </div>
  );
}
