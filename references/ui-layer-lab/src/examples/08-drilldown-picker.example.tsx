import { useState } from "react";
const patterns = [
  ["Workflow", "run > job > step > log"],
  ["Resource", "cluster > namespace > workload > pod"],
  ["Timeline", "incident > event > evidence > action"],
  ["Table", "row > side detail > nested tabs"],
  ["Graph", "node > neighbor > edge log > inspector"]
];

export default function DrilldownPickerExample() {
  const [selected, setSelected] = useState(patterns[0]);

  return (
    <div className="drill-grid two">
      <div>
        {patterns.map((pattern) => (
          <button
            className={pattern[0] === selected[0] ? "selected row-button" : "row-button"}
            key={pattern[0]}
            onClick={() => setSelected(pattern)}
          >
            {pattern[0]}
          </button>
        ))}
      </div>
      <div className="detail-panel">
        <strong>{selected[0]} drilldown</strong>
        <span>{selected[1]}</span>
      </div>
    </div>
  );
}
