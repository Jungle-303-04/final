import { useState } from "react";

const prompts = ["Explain failure", "Suggest patch", "Summarize run"];

export default function AiModelPickerChatExample() {
  const [model, setModel] = useState("fast");
  const [message, setMessage] = useState("Choose a model and prompt.");

  return (
    <div className="ai-prompt-card">
      <select value={model} onChange={(event) => setModel(event.target.value)}>
        <option value="fast">Fast</option>
        <option value="reasoning">Reasoning</option>
        <option value="code">Code</option>
      </select>
      <div className="chip-row">
        {prompts.map((prompt) => (
          <button key={prompt} onClick={() => setMessage(`${model} model: ${prompt}`)}>
            {prompt}
          </button>
        ))}
      </div>
      <span>{message}</span>
    </div>
  );
}
