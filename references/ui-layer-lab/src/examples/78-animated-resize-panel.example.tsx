import { useState } from "react";

export default function AnimatedResizePanelExample() {
  const [wide, setWide] = useState(false);

  return (
    <div className="resize-panel-demo">
      <button className="command-trigger stable-wide" onClick={() => setWide((value) => !value)} type="button">
        패널 전환
      </button>
      <section className={wide ? "wide" : ""}>
        <strong>{wide ? "확장 컨텍스트" : "간단 컨텍스트"}</strong>
        <span>패널 너비와 정보 밀도가 함께 전환됩니다.</span>
      </section>
    </div>
  );
}
