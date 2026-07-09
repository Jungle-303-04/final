import { useState } from "react";

const lines = ["L12 install ok", "L28 build warning", "L44 visual failed"];

export default function JobLogAnnotationThreadExample() {
  const [line, setLine] = useState(lines[2]);

  return (
    <div className="drill-grid two">
      <div className="drawer">{lines.map((item) => <button className="row-button" key={item} onClick={() => setLine(item)}>{item}</button>)}</div>
      <aside className="detail-panel">
        <strong>{line}</strong>
        <span>2 annotations</span>
      </aside>
    </div>
  );
}
