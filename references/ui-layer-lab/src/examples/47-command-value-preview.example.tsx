import { Command } from "cmdk";
import { useState } from "react";

const actions = [
  { id: "ask-ai", name: "AI에게 질문", scope: "오버레이", detail: "현재 페이지 위에서 AI 어시스턴트를 엽니다." },
  { id: "pull", name: "Git Pull", scope: "작업", detail: "활성 브랜치의 최신 변경을 가져와 재정렬합니다." },
  { id: "logs", name: "로그 열기", scope: "드릴다운", detail: "최신 워크플로 로그로 이동합니다." }
];

export default function CommandValuePreviewExample() {
  const [value, setValue] = useState(actions[0].id);
  const selected = actions.find((action) => action.id === value) ?? actions[0];

  return (
    <div className="inline-command-layout">
      <Command value={value} onValueChange={setValue} className="command-dialog inline-command">
        <Command.Input placeholder="액션을 검색하세요" />
        <Command.List>
          <Command.Group heading="액션">
            {actions.map((action) => (
              <Command.Item key={action.id} value={action.id} onSelect={() => setValue(action.id)}>
                <span>{action.name}</span>
                <kbd>{action.scope}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>

      <aside className="detail-panel">
        <strong>{selected.name}</strong>
        <span>{selected.scope}</span>
        <p>{selected.detail}</p>
      </aside>
    </div>
  );
}
