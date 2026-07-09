import { useState } from "react";

const events = ["대기열", "체크아웃", "빌드", "스모크 검사", "업로드"];

export default function JobRunTimelineSliderExample() {
  const [index, setIndex] = useState(2);

  return (
    <div className="threshold-heatmap">
      <label>
        <span aria-live="polite">현재 단계: {events[index]}</span>
        <input aria-label="작업 실행 타임라인 단계" type="range" min="0" max="4" value={index} onChange={(event) => setIndex(Number(event.target.value))} />
      </label>
      <div className="progress-track"><div style={{ width: `${(index + 1) * 20}%` }} /></div>
    </div>
  );
}
