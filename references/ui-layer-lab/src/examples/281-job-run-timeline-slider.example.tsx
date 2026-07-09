import { useState } from "react";

const events = ["queued", "checkout", "build", "smoke", "upload"];

export default function JobRunTimelineSliderExample() {
  const [index, setIndex] = useState(2);

  return (
    <div className="threshold-heatmap">
      <label>
        {events[index]}
        <input type="range" min="0" max="4" value={index} onChange={(event) => setIndex(Number(event.target.value))} />
      </label>
      <div className="progress-track"><div style={{ width: `${(index + 1) * 20}%` }} /></div>
    </div>
  );
}
