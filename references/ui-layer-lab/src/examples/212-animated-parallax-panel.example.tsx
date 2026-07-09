import { useState } from "react";

export default function AnimatedParallaxPanelExample() {
  const [offset, setOffset] = useState(0);

  return (
    <div className="parallax-card">
      <input type="range" min="0" max="80" value={offset} onChange={(event) => setOffset(Number(event.target.value))} />
      <div className="parallax-stage">
        <span style={{ transform: `translateY(${offset * 0.2}px)` }} />
        <span style={{ transform: `translateY(${offset * 0.45}px)` }} />
        <strong style={{ transform: `translateY(${-offset * 0.35}px)` }}>스크롤 연동 레이어</strong>
      </div>
    </div>
  );
}
