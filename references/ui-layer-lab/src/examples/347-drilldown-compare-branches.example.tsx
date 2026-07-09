import { useState } from "react";

const branches = {
  main: "42 checks, 1 warning",
  preview: "42 checks, 3 warnings",
  release: "40 checks, 0 warnings"
};

export default function DrilldownCompareBranchesExample() {
  const [branch, setBranch] = useState<keyof typeof branches>("preview");

  return (
    <div className="compare-panel">
      <section>
        {Object.keys(branches).map((item) => <button className="row-button" key={item} onClick={() => setBranch(item as keyof typeof branches)}>{item}</button>)}
      </section>
      <section>
        <strong>{branch}</strong>
        <span>{branches[branch]}</span>
      </section>
    </div>
  );
}
