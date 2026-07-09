import { useState } from "react";

const hunks = ["App.tsx +12", "styles.css +34", "registry.ts +2"];

export default function AiContextDiffPickerExample() {
  const [selected, setSelected] = useState(["App.tsx +12"]);

  return (
    <div className="context-chip-card">
      <strong>Diff context</strong>
      <div className="chip-row">
        {hunks.map((hunk) => (
          <button className={selected.includes(hunk) ? "active" : ""} key={hunk} onClick={() => setSelected((items) => (items.includes(hunk) ? items.filter((item) => item !== hunk) : [...items, hunk]))}>
            {hunk}
          </button>
        ))}
      </div>
      <span>{selected.length} hunks attached</span>
    </div>
  );
}
