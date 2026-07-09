import { useState } from "react";

const chips = ["current page", "git diff", "workflow log", "screenshot"];

export default function AiContextChipsExample() {
  const [selected, setSelected] = useState(["current page"]);

  function toggle(chip: string) {
    setSelected((items) => (items.includes(chip) ? items.filter((item) => item !== chip) : [...items, chip]));
  }

  return (
    <div className="context-chip-card">
      <strong>AI context</strong>
      <div className="chip-row">
        {chips.map((chip) => (
          <button className={selected.includes(chip) ? "active" : ""} key={chip} onClick={() => toggle(chip)}>
            {chip}
          </button>
        ))}
      </div>
      <span>{selected.join(", ")}</span>
    </div>
  );
}
