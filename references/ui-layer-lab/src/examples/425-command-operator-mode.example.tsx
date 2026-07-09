import { Command } from "cmdk";
import { useState } from "react";

const modes = {
  조회자: ["실행 열기", "링크 복사"],
  운영자: ["작업 재시도", "작업 취소"]
};

export default function CommandOperatorModeExample() {
  const [mode, setMode] = useState<keyof typeof modes>("조회자");
  const [action, setAction] = useState("실행 열기");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <div className="command-breadcrumb">
          <button onClick={() => setMode(mode === "조회자" ? "운영자" : "조회자")} type="button">{mode}</button>
        </div>
        <Command.Input placeholder="권한별 명령을 검색하세요" />
        <Command.List>
          <Command.Group heading={mode}>
            {modes[mode].map((item) => <Command.Item key={item} onSelect={() => setAction(item)} value={item}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{action}</strong>
        <span>{mode} 모드</span>
      </aside>
    </div>
  );
}
