import { Command } from "cmdk";
import { useState } from "react";

const jobs = ["타입 검사 실행", "프론트엔드 빌드", "미리보기 배포"];

export default function JobCommandPaletteLaunchExample() {
  const [job, setJob] = useState("실행한 작업이 없습니다");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="실행할 작업을 고르세요" />
        <Command.List>
          <Command.Group heading="작업">
            {jobs.map((item) => <Command.Item key={item} onSelect={() => setJob(`${item} 대기열 등록`)} value={item}>{item}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{job}</strong>
        <span>명령 선택은 백그라운드 작업을 시작합니다</span>
      </aside>
    </div>
  );
}
