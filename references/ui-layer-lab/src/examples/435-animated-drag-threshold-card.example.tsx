import { useState } from "react";

export default function AnimatedDragThresholdCardExample() {
  const [approved, setApproved] = useState(false);

  return (
    <div className="drag-stage">
      <button className={approved ? "drag-card dragging" : "drag-card"} onClick={() => setApproved((value) => !value)} type="button">
        <strong>{approved ? "임계값 충족" : "드래그 임계값"}</strong>
        <span>클릭해 상태를 시뮬레이션합니다.</span>
      </button>
    </div>
  );
}
