import { Command } from "cmdk";
import { useState } from "react";

const filters = ["상태:실패", "담당:나", "유형:배포", "브랜치:main"];

export default function CommandFilterBuilderExample() {
  const [selected, setSelected] = useState(["상태:실패"]);

  function toggle(filter: string) {
    setSelected((items) => (items.includes(filter) ? items.filter((item) => item !== filter) : [...items, filter]));
  }

  return (
    <div className="command-filter-demo">
      <div className="chip-row">
        {selected.map((filter) => <button className="active" key={filter} type="button">{filter}</button>)}
      </div>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="필터 추가..." />
        <Command.List>
          <Command.Group heading="필터">
            {filters.map((filter) => (
              <Command.Item key={filter} onSelect={() => toggle(filter)}>
                <span>{filter}</span>
                <kbd>{selected.includes(filter) ? "켜짐" : "꺼짐"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
