import type { TopbarProps } from "./shell.types";
import { Button } from "../design-system";

function MenuIcon() {
  return (
    <svg
      className="app-topbar__menu-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  );
}

export function Topbar({
  sidebarId,
  compactSidebarOpen,
  compactTriggerRef,
  breadcrumbs,
  scope,
  search,
  status,
  themeControl,
  actions,
  messages,
  onCompactSidebarOpenChange,
  onBreadcrumbNavigate,
}: TopbarProps) {
  return (
    <header className="app-topbar" data-shell-region="topbar">
      <div className="app-topbar__scope">
        <Button
          ref={compactTriggerRef}
          className="app-topbar__navigation-trigger"
          size="icon"
          variant="ghost"
          aria-label={messages.openNavigation}
          aria-controls={sidebarId}
          aria-expanded={compactSidebarOpen}
          onClick={() => onCompactSidebarOpenChange(true)}
        >
          <MenuIcon />
        </Button>

        {scope ?? (breadcrumbs && breadcrumbs.length > 0 ? (
          <nav
            className="app-topbar__breadcrumbs"
            aria-label={messages.breadcrumbs}
          >
            <ol>
              {breadcrumbs.map((breadcrumb, index) => {
                const current =
                  breadcrumb.current ?? index === breadcrumbs.length - 1;
                return (
                  <li key={breadcrumb.id}>
                    {breadcrumb.href && !current ? (
                      <a
                        href={breadcrumb.href}
                        onClick={(event) =>
                          onBreadcrumbNavigate?.(breadcrumb, event)
                        }
                      >
                        {breadcrumb.label}
                      </a>
                    ) : (
                      <span aria-current={current ? "page" : undefined}>
                        {breadcrumb.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null)}
      </div>

      {search ? (
        <div
          className="app-topbar__search"
          role="group"
          aria-label={messages.search}
        >
          {search}
        </div>
      ) : null}

      <div className="app-topbar__utilities">
        {status ? (
          <div
            className="app-topbar__status"
            aria-label={messages.status}
            aria-live="polite"
          >
            {status}
          </div>
        ) : null}
        {themeControl ? (
          <div
            className="app-topbar__theme"
            role="group"
            aria-label={messages.theme}
          >
            {themeControl}
          </div>
        ) : null}
        {actions ? (
          <div
            className="app-topbar__actions"
            role="toolbar"
            aria-label={messages.actions}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
