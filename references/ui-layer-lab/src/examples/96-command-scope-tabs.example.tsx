import { Command } from "cmdk";
import { useMemo, useState } from "react";

const scopes = ["전체", "파일", "실행", "문서"];
const items = [
  { name: "App.tsx 열기", scope: "파일" },
  { name: "실패 실행 검사", scope: "실행" },
  { name: "목표 명세 읽기", scope: "문서" },
  { name: "workflow.yaml 열기", scope: "파일" }
];

export default function CommandScopeTabsExample() {
  const [scope, setScope] = useState("전체");
  const [search, setSearch] = useState("");

  const results = useMemo(
    () =>
      items.filter((item) => {
        const scopeMatch = scope === "전체" || item.scope === scope;
        return scopeMatch && item.name.toLowerCase().includes(search.toLowerCase());
      }),
    [scope, search]
  );

  return (
    <div className="command-filter-demo">
      <div className="segmented-row">
        {scopes.map((item) => (
          <button className={scope === item ? "active" : ""} key={item} onClick={() => setScope(item)} type="button">
            {item}
          </button>
        ))}
      </div>
      <Command shouldFilter={false} className="command-dialog inline-command">
        <Command.Input value={search} onValueChange={setSearch} placeholder="현재 범위에서 검색하세요" />
        <Command.List>
          <Command.Group heading={scope}>
            {results.map((item) => (
              <Command.Item key={item.name}>
                <span>{item.name}</span>
                <kbd>{item.scope}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
