import { Command } from "cmdk";
import { useState } from "react";

const groups = {
  파일: ["src/App.tsx", "src/examples/registry.ts", "package.json"],
  이슈: ["미리보기 경로 404", "빌드 캐시 오래됨"],
  문서: ["명령 조합", "알림 위치 API"]
};

type Scope = keyof typeof groups | "전체";

export default function CommandFederatedSearchExample() {
  const [scope, setScope] = useState<Scope>("전체");

  const entries = Object.entries(groups).filter(([group]) => scope === "전체" || group === scope);
  const scopes: Scope[] = ["전체", ...Object.keys(groups) as Array<keyof typeof groups>];

  return (
    <div className="command-filter-demo">
      <div className="segmented-row">
        {scopes.map((item) => (
          <button aria-pressed={scope === item} className={scope === item ? "active" : ""} key={item} onClick={() => setScope(item)} type="button">
            {item}
          </button>
        ))}
      </div>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="파일, 이슈, 문서를 검색하세요..." />
        <Command.List>
          {entries.map(([group, items]) => (
            <Command.Group heading={group} key={group}>
              {items.map((item) => (
                <Command.Item key={item}>
                  <span>{item}</span>
                  <kbd>{group.slice(0, 1)}</kbd>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
