import { useState } from "react";

export default function DrilldownSplitResizerSimExample() {
  const [wide, setWide] = useState(false);

  return (
    <div className={wide ? "layout-switch-grid expanded" : "layout-switch-grid"}>
      <section>
        <button className="command-trigger stable-wide" onClick={() => setWide((value) => !value)} type="button">상세 폭 전환</button>
      </section>
      <section>
        <strong>{wide ? "넓은 상세 패널" : "간단 상세 패널"}</strong>
      </section>
    </div>
  );
}
