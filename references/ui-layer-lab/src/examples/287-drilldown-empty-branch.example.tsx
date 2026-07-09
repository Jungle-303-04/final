import { useState } from "react";

const branches = {
  failures: ["visual-smoke", "deploy-preview"],
  warnings: ["bundle-size"],
  skipped: []
};

export default function DrilldownEmptyBranchExample() {
  const [branch, setBranch] = useState<keyof typeof branches>("failures");

  return (
    <div className="drill-grid two">
      <div className="drawer">{Object.keys(branches).map((item) => <button className="row-button" key={item} onClick={() => setBranch(item as keyof typeof branches)}>{item}</button>)}</div>
      <aside className="detail-panel">
        <strong>{branch}</strong>
        {branches[branch].length ? branches[branch].map((item) => <span key={item}>{item}</span>) : <span>No items in this branch.</span>}
      </aside>
    </div>
  );
}
