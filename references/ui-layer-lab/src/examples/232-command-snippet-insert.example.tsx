import { Command } from "cmdk";
import { useState } from "react";

const snippets = {
  실패: "실패 단계의 원인을 설명하세요.",
  패치: "가장 작은 안전 패치를 작성하세요.",
  요약: "팀이 볼 수 있게 실행 결과를 요약하세요."
};

export default function CommandSnippetInsertExample() {
  const [text, setText] = useState("AI에게 요청: ");

  return (
    <div className="attachment-card">
      <textarea value={text} onChange={(event) => setText(event.target.value)} />
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="스니펫 삽입..." />
        <Command.List>
          <Command.Group heading="스니펫">
            {Object.entries(snippets).map(([key, value]) => (
              <Command.Item key={key} onSelect={() => setText((current) => `${current}${value}`)}>
                <span>{key}</span>
                <kbd>tab</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
