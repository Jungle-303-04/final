import { Command } from "cmdk";
import { useEffect, useState } from "react";

const pages = ["Dashboard", "Repositories", "Runs", "Clusters", "Settings"];

export default function CommandBasicExample() {
  const [open, setOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState("Dashboard");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
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

  function selectPage(page: string) {
    setSelectedPage(page);
    setOpen(false);
  }

  return (
    <div className="command-demo">
      <div className="demo-window">
        <div className="demo-sidebar">
          {pages.map((page) => (
            <button className={page === selectedPage ? "active" : ""} key={page} onClick={() => selectPage(page)}>
              {page}
            </button>
          ))}
        </div>
        <div className="demo-content">
          <div className="demo-toolbar">
            <strong>{selectedPage}</strong>
            <button className="command-trigger" onClick={() => setOpen(true)}>
              Search commands <kbd>⌘K</kbd>
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
        <div className="command-layer" role="dialog" aria-modal="true">
          <button className="command-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
          <Command className="command-dialog">
            <Command.Input autoFocus placeholder="Type a command or search..." />
            <Command.List>
              <Command.Empty>No results found.</Command.Empty>
              <Command.Group heading="Pages">
                {pages.map((page) => (
                  <Command.Item key={page} onSelect={() => selectPage(page)}>
                    <span className="command-icon">{page.slice(0, 1)}</span>
                    <span>{page}</span>
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
