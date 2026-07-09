import { useState } from "react";

const fields = ["상태", "담당자", "브랜치"];

export default function DrilldownQueryBuilderExample() {
  const [field, setField] = useState("상태");

  return (
    <div className="drill-grid two">
      <div className="drawer">
        {fields.map((item) => <button aria-pressed={field === item} className="row-button" key={item} onClick={() => setField(item)} type="button">{item}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>질의</strong>
        <code>{field}:실패</code>
        <span>필드를 누르면 드릴다운 질의를 다시 구성합니다.</span>
      </aside>
    </div>
  );
}
