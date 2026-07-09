import { Command } from "cmdk";
import { useState } from "react";

const stages = ["초안", "검토", "실행"];

export default function CommandStagedExecutionExample() {
  const [stage, setStage] = useState(0);

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="실행 단계를 검색하세요" />
        <Command.List>
          <Command.Group heading="실행 단계">
            <Command.Item onSelect={() => setStage((value) => Math.min(stages.length - 1, value + 1))}>다음 단계로 이동</Command.Item>
            <Command.Item onSelect={() => setStage(0)}>처음으로 되돌리기</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="checkpoint-card">
        <div className="checkpoint-row">
          {stages.map((item, index) => <span className={index <= stage ? "active" : ""} key={item}>{item}</span>)}
        </div>
      </aside>
    </div>
  );
}
