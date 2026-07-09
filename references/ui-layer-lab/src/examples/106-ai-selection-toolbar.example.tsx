import { useState } from "react";

export default function AiSelectionToolbarExample() {
  const [selected, setSelected] = useState(false);
  const [result, setResult] = useState("텍스트를 선택하면 AI에게 물어볼 수 있습니다.");

  return (
    <div className="selection-demo">
      <p onMouseUp={() => setSelected(true)}>미리보기 라우트가 404를 반환해서 시각 스모크 작업이 실패했습니다.</p>
      {selected ? (
        <div className="selection-toolbar">
          <button onClick={() => setResult("AI: 누락된 라우트가 가장 유력한 원인입니다.")} type="button">설명</button>
          <button onClick={() => setResult("AI: /preview를 복구하거나 테스트 대상을 갱신하세요.")} type="button">수정</button>
        </div>
      ) : null}
      <span>{result}</span>
    </div>
  );
}
