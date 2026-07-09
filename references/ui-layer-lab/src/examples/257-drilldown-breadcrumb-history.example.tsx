import { useState } from "react";

const path = ["workspace", "repo", "workflow", "job"];

export default function DrilldownBreadcrumbHistoryExample() {
  const [index, setIndex] = useState(3);

  return (
    <div className="breadcrumb-drill">
      <nav>{path.slice(0, index + 1).map((item, itemIndex) => <button key={item} onClick={() => setIndex(itemIndex)}>{item}</button>)}</nav>
      <div className="detail-panel">
        <strong>{path[index]}</strong>
        <span>Depth {index + 1}</span>
      </div>
    </div>
  );
}
