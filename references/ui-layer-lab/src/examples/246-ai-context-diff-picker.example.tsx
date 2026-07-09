import { useState } from "react";

const hunks = ["App.tsx +12", "styles.css +34", "registry.ts +2"];

export default function AiContextDiffPickerExample() {
  const [selected, setSelected] = useState(["App.tsx +12"]);

  return (
    <div className="context-chip-card">
      <strong>변경 맥락</strong>
      <div className="chip-row">
        {hunks.map((hunk) => (
          <button
            aria-pressed={selected.includes(hunk)}
            className={selected.includes(hunk) ? "active" : ""}
            key={hunk}
            onClick={() => setSelected((items) => (items.includes(hunk) ? items.filter((item) => item !== hunk) : [...items, hunk]))}
            type="button"
          >
            {hunk}
          </button>
        ))}
      </div>
      <span>첨부된 변경 묶음 {selected.length}개</span>
    </div>
  );
}
