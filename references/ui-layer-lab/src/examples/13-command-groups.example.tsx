import { Command } from "cmdk";
import { useState } from "react";

const groups: Array<[string, string[]]> = [
  ["추천", ["캘린더", "로그 검색", "계산기"]],
  ["Git", ["최신 변경 가져오기", "브랜치 푸시", "Pull request 열기"]],
  ["AI", ["AI에게 질문", "실패 설명", "실행 요약"]]
];

export default function CommandGroupsExample() {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState("AI에게 질문");

  return (
    <div className="command-demo">
      <div className="inline-command-layout">
        <Command className="command-dialog inline-command">
          <Command.Input placeholder="그룹 명령을 검색하세요" />
          <Command.List>
            <Command.Empty>검색 결과가 없습니다.</Command.Empty>
            {groups.map(([heading, items]) => (
              <Command.Group heading={heading} key={heading}>
                {items.map((item) => (
                  <Command.Item key={item} onSelect={() => setSelected(item)}>
                    <span className="command-icon">{item.slice(0, 1)}</span>
                    <span>{item}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
        <div className="result-panel">
          <strong>선택한 명령</strong>
          <span>{selected}</span>
          <button className="command-trigger stable-wide" onClick={() => setOpen((value) => !value)} type="button">
            결과 전환
          </button>
          {open ? <p className="muted">이 패널은 명령 실행 결과 미리보기로 사용할 수 있습니다.</p> : null}
        </div>
      </div>
    </div>
  );
}
