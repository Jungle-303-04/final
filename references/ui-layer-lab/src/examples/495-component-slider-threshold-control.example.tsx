import { useState } from "react";

export default function ComponentSliderThresholdControlExample() {
  const [threshold, setThreshold] = useState(70);

  return (
    <section className="component-demo">
      <header>
        <strong>임계값 슬라이더</strong>
        <span>히트맵이나 경고 기준을 즉시 조절</span>
      </header>
      <label className="component-field">
        <span>경고 임계값 {threshold}%</span>
        <input max="100" min="0" onChange={(event) => setThreshold(Number(event.target.value))} type="range" value={threshold} />
      </label>
      <div className="component-progress">
        <span>{threshold}%</span>
        <div><i style={{ width: `${threshold}%` }} /></div>
      </div>
    </section>
  );
}
