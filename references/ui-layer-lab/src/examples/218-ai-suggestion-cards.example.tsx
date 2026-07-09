import { useState } from "react";

const suggestions = ["로그 설명", "패치 생성", "실패 파일 열기"];

export default function AiSuggestionCardsExample() {
  const [selected, setSelected] = useState("로그 설명");

  return (
    <div className="suggestion-card-grid">
      {suggestions.map((suggestion) => (
        <button aria-pressed={selected === suggestion} className={selected === suggestion ? "active" : ""} key={suggestion} onClick={() => setSelected(suggestion)} type="button">
          {suggestion}
        </button>
      ))}
      <span>선택됨: {selected}</span>
    </div>
  );
}
