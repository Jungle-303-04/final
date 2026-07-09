import { useMemo, useState } from "react";

const logs = [
  "설치 완료",
  "타입 검사 완료",
  "시각 스모크 실패",
  "라우트 /preview 404 반환",
  "스크린샷 비교 건너뜀"
];

export default function DrilldownLogSearchExample() {
  const [query, setQuery] = useState("preview");
  const results = useMemo(() => logs.filter((line) => line.includes(query.toLowerCase())), [query]);

  return (
    <div className="drill-grid">
      <div className="drawer">
        <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} />
        {results.map((line) => (
          <button className="row-button" key={line} type="button">
            {line}
          </button>
        ))}
      </div>
      <aside className="detail-panel">
        <strong>일치 로그 {results.length}개</strong>
        <span>검색은 선택한 작업 컨텍스트 안에서만 적용됩니다.</span>
      </aside>
    </div>
  );
}
