import { Command } from "cmdk";
import { useState } from "react";

const history = ["상태:실패 담당:나", "브랜치:main 시각검사", "미리보기 배포"];

export default function CommandQueryHistoryExample() {
  const [query, setQuery] = useState("");

  return (
    <Command className="command-dialog inline-command">
      <Command.Input value={query} onValueChange={setQuery} placeholder="질의를 검색하거나 다시 사용하세요..." />
      <Command.List>
        <Command.Group heading="최근 질의">
          {history.map((item) => (
            <Command.Item key={item} onSelect={() => setQuery(item)}>
              {item}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command>
  );
}
