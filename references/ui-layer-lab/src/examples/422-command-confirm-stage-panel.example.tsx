import { Command } from "cmdk";
import { useState } from "react";

export default function CommandConfirmStagePanelExample() {
  const [pending, setPending] = useState("대기 중인 명령 없음");
  const [confirmed, setConfirmed] = useState("아직 실행하지 않음");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="실행할 명령을 선택하세요" />
        <Command.List>
          <Command.Group heading="확인 필요">
            <Command.Item onSelect={() => setPending("미리보기 캐시 삭제")}>미리보기 캐시 삭제</Command.Item>
            <Command.Item onSelect={() => setPending("브랜치 강제 푸시")}>브랜치 강제 푸시</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{pending}</strong>
        <button className="command-trigger" onClick={() => setConfirmed(pending)} type="button">확인</button>
        <span>{confirmed}</span>
      </aside>
    </div>
  );
}
