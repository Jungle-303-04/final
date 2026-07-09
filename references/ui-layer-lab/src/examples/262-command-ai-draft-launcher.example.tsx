import { Command } from "cmdk";
import { useState } from "react";

const drafts = ["실패 테스트 수정", "불안정 실행 설명", "릴리스 노트 작성"];

export default function CommandAiDraftLauncherExample() {
  const [draft, setDraft] = useState("열린 초안이 없습니다.");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="AI 초안 열기..." />
        <Command.List>
          <Command.Group heading="AI 초안">
            {drafts.map((item) => <Command.Item key={item} onSelect={() => setDraft(`초안 열림: ${item}`)}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>초안</strong>
        <span>{draft}</span>
      </aside>
    </div>
  );
}
