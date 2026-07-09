import { Command } from "cmdk";
import { useMemo, useState } from "react";

const projects = ["console-web", "cluster-agent", "deploy-worker", "gateway-api"];

export default function CommandEmptyStateExample() {
  const [search, setSearch] = useState("");

  const results = useMemo(
    () => projects.filter((project) => project.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  return (
    <Command shouldFilter={false} className="command-dialog inline-command">
      <Command.Input value={search} onValueChange={setSearch} placeholder="프로젝트를 검색하세요" />
      <Command.List>
        {results.length > 0 ? (
          <Command.Group heading="프로젝트">
            {results.map((project) => (
              <Command.Item key={project}>{project}</Command.Item>
            ))}
          </Command.Group>
        ) : (
          <Command.Empty>
            <div className="empty-state">
              <strong>프로젝트가 없습니다</strong>
              <span>이 검색어로 새 프로젝트를 만들 수 있습니다.</span>
              <button type="button">"{search || "프로젝트"}" 만들기</button>
            </div>
          </Command.Empty>
        )}
      </Command.List>
    </Command>
  );
}
