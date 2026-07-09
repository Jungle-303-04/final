import { useState } from "react";

export default function JobPausedStateExample() {
  const [paused, setPaused] = useState(true);

  return (
    <div className={`pause-card ${paused ? "paused" : ""}`}>
      <strong>{paused ? "승인 대기" : "실행 중"}</strong>
      <span>{paused ? "승인을 기다리고 있습니다." : "작업을 다시 시작했습니다."}</span>
      <button className="command-trigger stable-wide" onClick={() => setPaused((value) => !value)} type="button">
        {paused ? "다시 시작" : "일시 정지"}
      </button>
    </div>
  );
}
