import { Command } from "cmdk";
import { useState } from "react";

const repositories = Array.from({ length: 32 }, (_, index) => `service-${String(index + 1).padStart(2, "0")}`);

export default function CommandScrollableExample() {
  const [selected, setSelected] = useState(repositories[0]);

  return (
    <div className="command-demo">
      <div className="inline-command-layout">
        <Command className="command-dialog inline-command">
          <Command.Input placeholder="저장소를 검색하세요" />
          <Command.List className="command-scroll-list">
            <Command.Empty>저장소가 없습니다.</Command.Empty>
            <Command.Group heading="저장소">
              {repositories.map((repo) => (
                <Command.Item key={repo} onSelect={() => setSelected(repo)}>
                  <span className="command-icon">R</span>
                  <span>{repo}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
        <div className="result-panel">
          <strong>저장소</strong>
          <span>{selected}</span>
          <span className="status-dot">정상</span>
        </div>
      </div>
    </div>
  );
}
