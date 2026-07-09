import { Command } from "cmdk";
import { useState } from "react";

const actions = [
  { name: "로그 열기", allowed: true },
  { name: "러너 재시작", allowed: false },
  { name: "아티팩트 다운로드", allowed: true }
];

export default function CommandPermissionBadgePreviewExample() {
  const [action, setAction] = useState(actions[0]);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="보호된 액션을 검색하세요" />
        <Command.List>
          <Command.Group heading="액션">
            {actions.map((item) => (
              <Command.Item disabled={!item.allowed} key={item.name} onSelect={() => setAction(item)} value={item.name}>
                {item.name}
                <span>{item.allowed ? "허용됨" : "관리자"}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{action.name}</strong>
        <span>{action.allowed ? "실행 가능" : "관리자 권한 필요"}</span>
      </aside>
    </div>
  );
}
