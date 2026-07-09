import { Command } from "cmdk";
import { useMemo, useState } from "react";

const filters = ["전체", "파일", "작업", "설정"];
const commands = [
  { label: "package.json 열기", type: "파일" },
  { label: "타입 검사 실행", type: "작업" },
  { label: "다크 모드 전환", type: "설정" },
  { label: "워크플로 실행 확인", type: "작업" },
  { label: "App.tsx 열기", type: "파일" }
];

export default function CommandFilterTagsExample() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const results = useMemo(
    () =>
      commands.filter((command) => {
        const byFilter = filter === "전체" || command.type === filter;
        const bySearch = command.label.toLowerCase().includes(search.toLowerCase());
        return byFilter && bySearch;
      }),
    [filter, search]
  );

  return (
    <div className="command-filter-demo">
      <div className="segmented-row">
        {filters.map((item) => (
          <button className={item === filter ? "active" : ""} key={item} onClick={() => setFilter(item)} type="button">
            {item}
          </button>
        ))}
      </div>
      <Command shouldFilter={false} className="command-dialog inline-command">
        <Command.Input value={search} onValueChange={setSearch} placeholder="명령을 필터링하세요" />
        <Command.List>
          <Command.Group heading={filter}>
            {results.map((command) => (
              <Command.Item key={command.label}>
                <span>{command.label}</span>
                <kbd>{command.type}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
          {results.length === 0 ? <Command.Empty>명령이 없습니다.</Command.Empty> : null}
        </Command.List>
      </Command>
    </div>
  );
}
