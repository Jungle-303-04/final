import { Command } from "cmdk";
import { useMemo, useState } from "react";

const results = ["저장소:web 상태:실패", "저장소:api 담당:나", "태그:AI 파일:diff.tsx"];

export default function CommandTokenizedQueryExample() {
  const [query, setQuery] = useState("저장소:web 상태:실패");
  const tokens = useMemo(() => query.split(" ").filter(Boolean), [query]);

  return (
    <div className="command-filter-demo">
      <div className="chip-row">
        {tokens.map((token) => (
          <button className="active" key={token} type="button">{token}</button>
        ))}
      </div>
      <Command className="command-dialog inline-command">
        <Command.Input value={query} onValueChange={setQuery} placeholder="저장소:web 상태:실패" />
        <Command.List>
          <Command.Group heading="분석 결과">
            {results.map((item) => (
              <Command.Item key={item}>{item}</Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
