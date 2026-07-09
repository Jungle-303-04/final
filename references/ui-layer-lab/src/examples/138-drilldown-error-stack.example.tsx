import { useState } from "react";

const frames = [
  { file: "smoke.spec.ts", line: 41, detail: "/preview 경로가 로드되지 않았습니다." },
  { file: "router.tsx", line: 18, detail: "등록된 라우트 목록에서 대상이 사라졌습니다." },
  { file: "App.tsx", line: 7, detail: "설정 기반 라우트 렌더링 중 예외가 발생했습니다." }
];

export default function DrilldownErrorStackExample() {
  const [frame, setFrame] = useState(frames[0]);

  return (
    <div className="table-drill">
      <div className="stack-list">
        {frames.map((item) => (
          <button aria-pressed={item.file === frame.file} className={item.file === frame.file ? "active" : ""} key={item.file} onClick={() => setFrame(item)} type="button">
            {item.file}:{item.line}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>{frame.file}</strong>
        <span>{frame.line}번째 줄</span>
        <span>{frame.detail}</span>
      </aside>
    </div>
  );
}
