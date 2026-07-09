import { Command } from "cmdk";
import { useState } from "react";

const events = ["배포 승인", "캐시 비움", "시크릿 교체"];

export default function CommandAuditLogActionExample() {
  const [audit, setAudit] = useState("선택된 감사 이벤트가 없습니다.");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="감사 액션 검색..." />
        <Command.List>
          <Command.Group heading="감사 이벤트">
            {events.map((event) => (
              <Command.Item key={event} onSelect={() => setAudit(`${event} 기록을 복사했습니다.`)}>
                {event}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>감사 기록</strong>
        <span>{audit}</span>
      </aside>
    </div>
  );
}
