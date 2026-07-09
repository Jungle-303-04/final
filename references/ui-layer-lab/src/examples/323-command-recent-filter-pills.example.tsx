import { Command } from "cmdk";
import { useState } from "react";

const filters = ["실패", "내 작업", "시각 검사", "배포"];

export default function CommandRecentFilterPillsExample() {
  const [recent, setRecent] = useState(["실패"]);

  function useFilter(filter: string) {
    setRecent((items) => [filter, ...items.filter((item) => item !== filter)].slice(0, 3));
  }

  return (
    <div className="command-filter-demo">
      <div className="chip-row">{recent.map((item) => <button className="active" key={item} type="button">{item}</button>)}</div>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="필터를 적용하세요" />
        <Command.List>
          <Command.Group heading="필터">
            {filters.map((filter) => <Command.Item key={filter} onSelect={() => useFilter(filter)}>{filter}</Command.Item>)}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
