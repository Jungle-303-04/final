import { useState } from "react";

const fields = ["status", "owner", "branch"];

export default function DrilldownQueryBuilderExample() {
  const [field, setField] = useState("status");

  return (
    <div className="drill-grid two">
      <div className="drawer">
        {fields.map((item) => <button className="row-button" key={item} onClick={() => setField(item)}>{item}</button>)}
      </div>
      <aside className="detail-panel">
        <strong>Query</strong>
        <code>{field}:failed</code>
        <span>Click a field to rebuild the drill query.</span>
      </aside>
    </div>
  );
}
