import { useState } from "react";

export default function ComponentTooltipKbdHintsExample() {
  const [hint, setHint] = useState("버튼에 포커스하거나 마우스를 올리세요.");

  return (
    <section className="component-demo">
      <header>
        <strong>단축키 툴팁</strong>
        <span>아이콘성 액션에 의미와 키보드 힌트를 제공</span>
      </header>
      <div className="tooltip-row">
        <button onFocus={() => setHint("명령 메뉴 열기")} onMouseEnter={() => setHint("명령 메뉴 열기")}>⌘K</button>
        <button onFocus={() => setHint("현재 로그 복사")} onMouseEnter={() => setHint("현재 로그 복사")}>⌘C</button>
        <button onFocus={() => setHint("작업 다시 실행")} onMouseEnter={() => setHint("작업 다시 실행")}>↻</button>
      </div>
      <div className="tooltip-bubble">{hint}</div>
    </section>
  );
}
