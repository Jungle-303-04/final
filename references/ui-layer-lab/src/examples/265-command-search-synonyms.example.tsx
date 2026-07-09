import { Command } from "cmdk";
import { useState } from "react";

const synonyms = {
  fail: {
    label: "실패",
    words: ["실패", "오류", "깨짐"]
  },
  deploy: {
    label: "배포",
    words: ["릴리스", "출시", "승격"]
  },
  ai: {
    label: "AI",
    words: ["어시스턴트", "코파일럿", "에이전트"]
  }
};

export default function CommandSearchSynonymsExample() {
  const [term, setTerm] = useState<keyof typeof synonyms>("fail");

  return (
    <div className="inline-command-layout">
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="동의어 그룹 검색..." />
        <Command.List>
          <Command.Group heading="검색어">
            {Object.entries(synonyms).map(([item, value]) => (
              <Command.Item key={item} onSelect={() => setTerm(item as keyof typeof synonyms)} value={item}>
                {value.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
      <aside className="detail-panel">
        <strong>{synonyms[term].label}</strong>
        <span>{synonyms[term].words.join(", ")}</span>
      </aside>
    </div>
  );
}
