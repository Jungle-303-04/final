import { useState } from "react";

const chips = ["현재 페이지", "Git 차이", "워크플로 로그", "스크린샷"];

export default function AiContextChipsExample() {
  const [selected, setSelected] = useState(["현재 페이지"]);

  function toggle(chip: string) {
    setSelected((items) => (items.includes(chip) ? items.filter((item) => item !== chip) : [...items, chip]));
  }

  return (
    <div className="context-chip-card">
      <strong>AI 컨텍스트</strong>
      <div className="chip-row">
        {chips.map((chip) => (
          <button className={selected.includes(chip) ? "active" : ""} key={chip} onClick={() => toggle(chip)} type="button">
            {chip}
          </button>
        ))}
      </div>
      <span>{selected.join(", ")}</span>
    </div>
  );
}
