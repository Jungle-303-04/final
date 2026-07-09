import { useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { ExampleSection } from "./components/ExampleSection";
import { SearchBar } from "./components/SearchBar";
import { SidebarNav } from "./components/SidebarNav";
import { ThemeToggle } from "./components/ThemeToggle";
import { useTheme } from "./components/useTheme";
import { groupedExamples, registeredExamples } from "./examples/registry";

export default function App() {
  const groups = useMemo(() => groupedExamples(), []);
  const [activeCategory, setActiveCategory] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    return groups.some((group) => group.id === hash) ? hash : groups[0]?.id ?? "";
  });
  const [query, setQuery] = useState("");
  const { theme, toggleTheme } = useTheme();
  const activeGroup = groups.find((group) => group.id === activeCategory) ?? groups[0];

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.requestAnimationFrame(() => window.scrollTo(0, 0));

    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  function selectCategory(category: string) {
    setActiveCategory(category);
    setQuery("");
    window.history.replaceState(null, "", `#${category}`);
  }

  const filteredExamples = activeGroup.examples.filter((example) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [example.title, example.description, example.motionIntent, ...example.variantIds]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });

  return (
    <>
      <main className="page docs-page">
        <SidebarNav activeCategory={activeGroup.id} groups={groups} onSelect={selectCategory} />

        <div className="docs-content">
          <header className="page-header">
            <h1>UI 레이어 레퍼런스 랩</h1>
            <p>
              현재 확보한 {registeredExamples.length}개 예제를 주제별로 최대한 노출하고, 같은 패턴은 archive 후보로 묶어 정리합니다.
              각 예제는 동작, 코드, 라이트/다크 품질을 계속 감사합니다.
            </p>
          </header>

          <div className="toolbar-row">
            <SearchBar onChange={setQuery} value={query} />
            <ThemeToggle onToggle={toggleTheme} theme={theme} />
          </div>

          <section className="viewer-grid" data-active-category={activeGroup.id}>
            <header className="category-summary">
              <div>
                <h2>{activeGroup.label}</h2>
                <p>{activeGroup.purpose}</p>
                <p className="category-when">사용 시점: {activeGroup.whenToUse}</p>
              </div>
              <span className="example-count">
                대표 {activeGroup.examples.length}개 · archive {activeGroup.archivedCount}개
              </span>
            </header>

            <div className="example-list">
              <section className="example-group" aria-label={`${activeGroup.label} 대표 예제`}>
                {filteredExamples.map((example) => (
                  <ExampleSection example={example} key={example.id} />
                ))}
                {!filteredExamples.length ? <div className="preview-loading">검색 결과가 없습니다.</div> : null}
              </section>
            </div>
          </section>
        </div>
      </main>
      <Toaster theme={theme} richColors closeButton />
    </>
  );
}
