import { Command } from "cmdk";
import { useEffect, useMemo, useState } from "react";

const repositories = [
  "console-frontend",
  "cluster-agent",
  "gitops-worker",
  "gateway-api",
  "dashboard-worker",
  "manifest-renderer"
];

export default function CommandAsyncResultsExample() {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(repositories);

  const filtered = useMemo(
    () => repositories.filter((repo) => repo.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => {
      setResults(filtered);
      setLoading(false);
    }, 420);

    return () => window.clearTimeout(timer);
  }, [filtered]);

  return (
    <Command className="command-dialog inline-command">
      <Command.Input value={search} onValueChange={setSearch} placeholder="저장소를 검색하세요" />
      <Command.List>
        {loading ? <div className="command-loading">검색 중...</div> : null}
        {!loading && results.length === 0 ? <Command.Empty>저장소가 없습니다.</Command.Empty> : null}
        {!loading ? (
          <Command.Group heading="저장소">
            {results.map((repo) => (
              <Command.Item key={repo}>{repo}</Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command>
  );
}
