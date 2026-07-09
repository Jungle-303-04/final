import { useState } from "react";

const suggestions = ["Run typecheck", "Open failed logs", "Ask AI to patch"];

export default function AiCommandSuggestionsExample() {
  const [choice, setChoice] = useState("No suggestion selected.");

  return (
    <div className="suggestion-card-grid">
      {suggestions.map((item) => (
        <button key={item} onClick={() => setChoice(item)}>
          {item}
        </button>
      ))}
      <span>{choice}</span>
    </div>
  );
}
