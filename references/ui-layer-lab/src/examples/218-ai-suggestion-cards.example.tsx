import { useState } from "react";

const suggestions = ["Explain logs", "Create patch", "Open failing file"];

export default function AiSuggestionCardsExample() {
  const [selected, setSelected] = useState("Explain logs");

  return (
    <div className="suggestion-card-grid">
      {suggestions.map((suggestion) => (
        <button className={selected === suggestion ? "active" : ""} key={suggestion} onClick={() => setSelected(suggestion)}>
          {suggestion}
        </button>
      ))}
      <span>{selected} selected</span>
    </div>
  );
}
