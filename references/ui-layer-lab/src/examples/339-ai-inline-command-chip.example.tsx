import { useState } from "react";

const chips = ["explain", "fix", "test"];

export default function AiInlineCommandChipExample() {
  const [chip, setChip] = useState("explain");

  return (
    <div className="context-chip-card">
      <strong>Selected text: failing route</strong>
      <div className="chip-row">
        {chips.map((item) => <button className={chip === item ? "active" : ""} key={item} onClick={() => setChip(item)}>{item}</button>)}
      </div>
      <span>AI command: {chip}</span>
    </div>
  );
}
