import { useState } from "react";

export default function AiToolResultCardExample() {
  const [result, setResult] = useState("도구가 아직 실행되지 않았습니다.");

  return (
    <div className="tool-call-card">
      <strong>도구 호출</strong>
      <code>git diff -- src/App.tsx</code>
      <span>{result}</span>
      <div className="tool-call-actions">
        <button onClick={() => setResult("변경 묶음 2개를 찾았습니다.")} type="button">실행</button>
        <button onClick={() => setResult("결과를 대화에 첨부했습니다.")} type="button">첨부</button>
      </div>
    </div>
  );
}
