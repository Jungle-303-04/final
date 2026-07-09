import { Command } from "cmdk";
import { useEffect, useState } from "react";

const pages = [
  { id: "dashboard", label: "대시보드", icon: "대" },
  { id: "repositories", label: "저장소", icon: "저" },
  { id: "runs", label: "실행", icon: "실" },
  { id: "clusters", label: "클러스터", icon: "클" },
  { id: "settings", label: "설정", icon: "설" }
];

export default function CommandBasicExample() {
  const [open, setOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState(pages[0]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function selectPage(page: (typeof pages)[number]) {
    setSelectedPage(page);
    setOpen(false);
  }

  return (
    <div className="command-demo">
      <div className="demo-window">
        <div className="demo-sidebar">
          {pages.map((page) => (
            <button className={page.id === selectedPage.id ? "active" : ""} key={page.id} onClick={() => selectPage(page)} type="button">
              {page.label}
            </button>
          ))}
        </div>
        <div className="demo-content">
          <div className="demo-toolbar">
            <strong>{selectedPage.label}</strong>
            <button className="command-trigger stable-wide" data-stable-control="command-open" onClick={() => setOpen(true)} type="button">
              명령 검색 <kbd>⌘K</kbd>
            </button>
          </div>
          <div className="demo-grid">
            <div />
            <div />
            <div />
            <div />
          </div>
        </div>
      </div>

      {open ? (
        <div className="command-layer" role="dialog" aria-label="명령 팔레트" aria-modal="true">
          <button className="command-backdrop" aria-label="닫기" onClick={() => setOpen(false)} type="button" />
          <Command className="command-dialog">
            <Command.Input autoFocus placeholder="명령이나 페이지를 검색하세요" />
            <Command.List>
              <Command.Empty>검색 결과가 없습니다.</Command.Empty>
              <Command.Group heading="페이지">
                {pages.map((page) => (
                  <Command.Item key={page.id} onSelect={() => selectPage(page)}>
                    <span className="command-icon">{page.icon}</span>
                    <span>{page.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      ) : null}
    </div>
  );
}
