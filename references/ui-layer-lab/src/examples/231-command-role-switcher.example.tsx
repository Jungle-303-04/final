import { Command } from "cmdk";
import { useState } from "react";

const actions = {
  조회자: ["로그 열기", "실행 링크 복사"],
  관리자: ["작업 재실행", "배포 승인", "로그 열기"],
  운영자: ["시크릿 교체", "미리보기 삭제", "배포 승인"]
};

export default function CommandRoleSwitcherExample() {
  const [role, setRole] = useState<keyof typeof actions>("조회자");

  return (
    <div className="inline-command-layout">
      <div className="segmented-row">
        {Object.keys(actions).map((item) => (
          <button aria-pressed={role === item} className={role === item ? "active stable-wide" : "stable-wide"} key={item} onClick={() => setRole(item as keyof typeof actions)} type="button">
            {item}
          </button>
        ))}
      </div>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder={`${role} 권한의 액션 검색...`} />
        <Command.List>
          <Command.Group heading={role}>
            {actions[role].map((action) => <Command.Item key={action}>{action}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
