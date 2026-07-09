import { Command } from "cmdk";
import { useState } from "react";

export default function CommandConfirmDangerExample() {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("위험 작업이 선택되지 않았습니다.");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="실행할 작업을 검색하세요..." />
        <Command.List>
          <Command.Group heading="안전 작업">
            <Command.Item onSelect={() => setStatus("로그를 열었습니다.")}>로그 열기</Command.Item>
            <Command.Item onSelect={() => setStatus("사전 실행을 시작했습니다.")}>사전 실행 시작</Command.Item>
          </Command.Group>
          <Command.Group heading="주의 구역">
            <Command.Item onSelect={() => setConfirming(true)}>미리보기 환경 삭제</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{confirming ? "삭제 확인" : "상태"}</strong>
        <span>{confirming ? "이 작업은 미리보기 환경을 제거합니다." : status}</span>
        {confirming ? (
          <button
            className="command-trigger stable-wide"
            onClick={() => {
              setConfirming(false);
              setStatus("미리보기 환경을 삭제했습니다.");
            }}
            type="button"
          >
            삭제 확정
          </button>
        ) : null}
      </aside>
    </div>
  );
}
