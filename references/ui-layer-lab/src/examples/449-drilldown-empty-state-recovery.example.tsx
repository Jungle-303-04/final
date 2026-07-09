import { useState } from "react";

export default function DrilldownEmptyStateRecoveryExample() {
  const [hasData, setHasData] = useState(false);

  return (
    <div className="empty-state">
      <strong>{hasData ? "복구된 분기" : "빈 분기"}</strong>
      <span>{hasData ? "주변 로그 2개를 불러왔습니다." : "현재 필터와 일치하는 로그가 없습니다."}</span>
      <button onClick={() => setHasData(true)} type="button">주변 로그 불러오기</button>
    </div>
  );
}
