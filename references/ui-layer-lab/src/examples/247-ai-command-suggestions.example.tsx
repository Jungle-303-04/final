import { useState } from "react";

const suggestions = ["타입 검사 실행", "실패 로그 열기", "AI에게 패치 요청"];

export default function AiCommandSuggestionsExample() {
  const [choice, setChoice] = useState("선택한 제안이 없습니다.");

  return (
    <div className="suggestion-card-grid">
      {suggestions.map((item) => (
        <button aria-pressed={choice === item} className={choice === item ? "active" : ""} key={item} onClick={() => setChoice(item)} type="button">
          {item}
        </button>
      ))}
      <span>{choice}</span>
    </div>
  );
}
