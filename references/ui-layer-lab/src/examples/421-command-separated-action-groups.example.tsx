import { Command } from "cmdk";
import { useState } from "react";

const groups = {
  이동: ["대시보드 열기", "로그 열기"],
  변경: ["실패 작업 재시도", "대기 작업 취소"]
};

export default function CommandSeparatedActionGroupsExample() {
  const [action, setAction] = useState("대시보드 열기");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="그룹화된 액션 검색" />
        <Command.List>
          {Object.entries(groups).map(([group, actions]) => (
            <Command.Group heading={group} key={group}>
              {actions.map((item) => <Command.Item key={item} onSelect={() => setAction(item)} value={item}>{item}</Command.Item>)}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{action}</strong>
        <span>선택한 명령이 상세 패널에 연결됩니다.</span>
      </aside>
    </div>
  );
}
