import { Command } from "cmdk";
import { useState } from "react";

const actions = ["파일 열기", "검사 실행", "로그 요약", "노트 만들기", "미리보기 배포"];

export default function CommandDensityToggleExample() {
  const [dense, setDense] = useState(false);

  return (
    <div className="command-filter-demo">
      <button className="command-trigger stable-wide" onClick={() => setDense((value) => !value)} type="button">
        {dense ? "기본 밀도" : "촘촘하게"}
      </button>
      <Command className={`command-dialog inline-command ${dense ? "dense-command" : ""}`}>
        <Command.Input placeholder="액션을 검색하세요" />
        <Command.List>
          <Command.Group heading={dense ? "촘촘한 목록" : "기본 목록"}>
            {actions.map((action) => (
              <Command.Item key={action}>{action}</Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
