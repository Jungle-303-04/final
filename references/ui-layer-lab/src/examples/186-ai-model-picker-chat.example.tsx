import { useState } from "react";

const prompts = ["실패 설명", "패치 제안", "실행 요약"];

const modelLabels: Record<string, string> = {
  fast: "빠른 응답",
  reasoning: "추론 강화",
  code: "코드 중심"
};

export default function AiModelPickerChatExample() {
  const [model, setModel] = useState("fast");
  const [message, setMessage] = useState("모델과 프롬프트를 선택하세요.");

  return (
    <div className="ai-prompt-card">
      <select value={model} onChange={(event) => setModel(event.target.value)}>
        <option value="fast">빠른 응답</option>
        <option value="reasoning">추론 강화</option>
        <option value="code">코드 중심</option>
      </select>
      <div className="chip-row">
        {prompts.map((prompt) => (
          <button key={prompt} onClick={() => setMessage(`${modelLabels[model]} 모델: ${prompt}`)} type="button">
            {prompt}
          </button>
        ))}
      </div>
      <span>{message}</span>
    </div>
  );
}
