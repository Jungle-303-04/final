import { Command } from "cmdk";
import { useState } from "react";

export default function CommandAccessRequestExample() {
  const [message, setMessage] = useState("운영 배포는 제한되어 있습니다.");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="제한된 액션 검색..." />
        <Command.List>
          <Command.Group heading="제한됨">
            <Command.Item onSelect={() => setMessage("관리자에게 접근 요청을 보냈습니다.")}>
              <span>운영 배포 권한 요청</span>
              <kbd>잠김</kbd>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>접근 권한</strong>
        <span>{message}</span>
      </aside>
    </div>
  );
}
