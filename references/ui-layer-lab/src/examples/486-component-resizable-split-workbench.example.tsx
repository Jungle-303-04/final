import { useState } from "react";

export default function ComponentResizableSplitWorkbenchExample() {
  const [wide, setWide] = useState(false);

  return (
    <section className="component-demo wide-demo">
      <header>
        <strong>분할 작업대</strong>
        <span>로그와 AI 분석 패널의 폭을 전환</span>
      </header>
      <div className={`resizable-workbench ${wide ? "wide" : ""}`}>
        <pre>
          <code>$ npm test{"\n"}FAIL overlay.spec.ts{"\n"}expected drawer to be visible</code>
        </pre>
        <aside>
          <strong>AI 분석</strong>
          <p>실패 원인은 overlay가 열리기 전에 assertion이 실행된 타이밍 문제입니다.</p>
          <button onClick={() => setWide((value) => !value)}>{wide ? "균등 보기" : "분석 넓게"}</button>
        </aside>
      </div>
    </section>
  );
}
