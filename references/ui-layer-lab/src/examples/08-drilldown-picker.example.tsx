import { useState } from "react";
const patterns = [
  ["워크플로", "실행 > 작업 > 단계 > 로그"],
  ["리소스", "클러스터 > 네임스페이스 > 워크로드 > 파드"],
  ["타임라인", "사건 > 이벤트 > 근거 > 조치"],
  ["테이블", "행 > 사이드 상세 > 중첩 탭"],
  ["그래프", "노드 > 이웃 > 엣지 로그 > inspector"]
];

export default function DrilldownPickerExample() {
  const [selected, setSelected] = useState(patterns[0]);

  return (
    <div className="drill-grid two">
      <div>
        {patterns.map((pattern) => (
          <button
            className={pattern[0] === selected[0] ? "selected row-button" : "row-button"}
            key={pattern[0]}
            onClick={() => setSelected(pattern)}
            type="button"
          >
            {pattern[0]}
          </button>
        ))}
      </div>
      <div className="detail-panel">
        <strong>{selected[0]} 드릴다운</strong>
        <span>{selected[1]}</span>
      </div>
    </div>
  );
}
