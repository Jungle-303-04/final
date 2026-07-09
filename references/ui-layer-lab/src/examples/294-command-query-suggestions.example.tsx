import { Command } from "cmdk";
import { useState } from "react";

const suggestions = [
  { token: "is:failed", label: "실패 상태" },
  { token: "label:visual", label: "시각 검증" },
  { token: "branch:preview", label: "미리보기 브랜치" },
  { token: "owner:me", label: "내 담당" }
];

export default function CommandQuerySuggestionsExample() {
  const [query, setQuery] = useState([suggestions[0].token]);

  function addToken(token: string) {
    setQuery((items) => (items.includes(token) ? items : [...items, token]));
  }

  const selectedLabels = suggestions.filter((item) => query.includes(item.token)).map((item) => item.label).join(", ");

  return (
    <div className="command-filter-demo">
      <strong aria-live="polite">선택한 토큰: {selectedLabels}</strong>
      <Command className="command-dialog inline-command">
        <Command.Input placeholder="질의 토큰 추가..." />
        <Command.List>
          <Command.Group heading="추천 토큰">
            {suggestions.map((item) => (
              <Command.Item aria-selected={query.includes(item.token)} key={item.token} onSelect={() => addToken(item.token)} value={item.label}>
                <span>{item.label}</span>
                <kbd>{query.includes(item.token) ? "켜짐" : "추가"}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
