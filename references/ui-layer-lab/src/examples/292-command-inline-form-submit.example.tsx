import { Command } from "cmdk";
import { useState } from "react";

const actions = ["브랜치 생성", "풀 리퀘스트 열기", "릴리스 노트 초안"];

export default function CommandInlineFormSubmitExample() {
  const [action, setAction] = useState(actions[0]);
  const [name, setName] = useState("woonyong/ui-layer-lab");
  const [submitted, setSubmitted] = useState("대기 중");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="액션을 선택하세요..." />
        <Command.List>
          <Command.Group heading="액션">
            {actions.map((item) => <Command.Item key={item} onSelect={() => setAction(item)} value={item}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{action}</strong>
        <input aria-label="대상 저장소" className="search-input" value={name} onChange={(event) => setName(event.target.value)} />
        <button className="command-trigger stable-wide" onClick={() => setSubmitted(`${action}: ${name}`)} type="button">제출</button>
        <span aria-live="polite">{submitted}</span>
      </aside>
    </div>
  );
}
