import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import type { SidebarNavigationItem, SidebarProps } from "./shell.types";

const ENABLED_NAVIGATION_SELECTOR =
  '[data-shell-navigation-item="true"]:not([aria-disabled="true"])';

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function isVisible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

function itemContent(
  item: SidebarNavigationItem,
  tooltipId: string,
): ReactNode {
  return (
    <>
      <span className="app-sidebar__item-icon" aria-hidden="true">
        {item.icon}
      </span>
      <span className="app-sidebar__item-copy">
        <span className="app-sidebar__item-label">{item.label}</span>
        {item.description ? (
          <span className="app-sidebar__item-description">
            {item.description}
          </span>
        ) : null}
        {item.disabledReason ? (
          <span className="app-sidebar__item-reason">
            {item.disabledReason}
          </span>
        ) : null}
      </span>
      {item.badge ? (
        <span className="app-sidebar__item-badge">{item.badge}</span>
      ) : null}
      <span className="app-sidebar__tooltip" id={tooltipId} role="tooltip">
        <span>{item.label}</span>
        {item.disabledReason ? <small>{item.disabledReason}</small> : null}
      </span>
    </>
  );
}

function ChevronIcon({ expanded }: { readonly expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="app-sidebar__chevron"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path d="m12.5 4.5-5 5.5 5 5.5" />
      <path className="app-sidebar__chevron-rail" d="M16 3v14" />
      {expanded ? null : <path d="m7.5 4.5 5 5.5-5 5.5" />}
    </svg>
  );
}

export function Sidebar({
  id,
  registry,
  activeItemId,
  expanded,
  compact,
  overlayOpen,
  brand,
  footer,
  messages,
  onExpandedChange,
  onOverlayOpenChange,
  onNavigate,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const modal = compact && overlayOpen;
  const hiddenOffCanvas = compact && !overlayOpen;

  useEffect(() => {
    if (!modal) {
      return;
    }

    const sidebar = sidebarRef.current;
    if (!sidebar) {
      return;
    }

    const focusableElements = (): HTMLElement[] =>
      Array.from(sidebar.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        isVisible,
      );

    const animationFrame = window.requestAnimationFrame(() => {
      focusableElements()[0]?.focus({ preventScroll: true });
    });

    const handleModalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOverlayOpenChange(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = elements.at(0);
      const last = elements.at(-1);
      const active = document.activeElement;

      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && (active === first || !sidebar.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleModalKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleModalKeyDown);
    };
  }, [modal, onOverlayOpenChange]);

  const handleNavigationKeyDown = (
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
      !(event.target instanceof HTMLElement)
    ) {
      return;
    }

    const navigation = navigationRef.current;
    if (!navigation) {
      return;
    }

    const items = Array.from(
      navigation.querySelectorAll<HTMLElement>(ENABLED_NAVIGATION_SELECTOR),
    ).filter(isVisible);
    const currentIndex = items.indexOf(event.target);

    if (currentIndex < 0 || items.length === 0) {
      return;
    }

    event.preventDefault();

    if (event.key === "Home") {
      items.at(0)?.focus();
      return;
    }

    if (event.key === "End") {
      items.at(-1)?.focus();
      return;
    }

    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + direction + items.length) % items.length;
    items.at(nextIndex)?.focus();
  };

  return (
    <aside
      ref={sidebarRef}
      id={id}
      className="app-sidebar"
      aria-hidden={hiddenOffCanvas || undefined}
      aria-label={modal ? messages.navigation : undefined}
      aria-modal={modal || undefined}
      role={modal ? "dialog" : undefined}
      inert={hiddenOffCanvas}
      data-expanded={expanded}
      data-overlay-open={overlayOpen}
      data-shell-region="sidebar"
    >
      <div className="app-sidebar__header">
        {brand ? <div className="app-sidebar__brand">{brand}</div> : null}
        <button
          className="app-sidebar__mobile-close"
          type="button"
          aria-label={messages.closeNavigation}
          aria-controls={id}
          onClick={() => onOverlayOpenChange(false)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <nav
        ref={navigationRef}
        className="app-sidebar__navigation"
        aria-label={messages.navigation}
        data-shell-region="navigation"
        onKeyDown={handleNavigationKeyDown}
      >
        {registry.map((section, sectionIndex) => (
          <section className="app-sidebar__section" key={section.id}>
            {section.label ? (
              <h2 className="app-sidebar__section-label">{section.label}</h2>
            ) : null}
            <ul className="app-sidebar__list">
              {section.items.map((item, itemIndex) => {
                const active = item.id === activeItemId;
                const tooltipId = `${id}-tooltip-${sectionIndex}-${itemIndex}`;
                const itemClassName = [
                  "app-sidebar__item",
                  active ? "app-sidebar__item--active" : "",
                  item.disabled ? "app-sidebar__item--disabled" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <li className="app-sidebar__list-item" key={item.id}>
                    {item.disabled ? (
                      <span
                        className={itemClassName}
                        role="link"
                        tabIndex={0}
                        aria-disabled="true"
                        aria-describedby={tooltipId}
                        data-shell-navigation-item="true"
                      >
                        {itemContent(item, tooltipId)}
                      </span>
                    ) : (
                      <a
                        className={itemClassName}
                        href={item.href}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noreferrer" : undefined}
                        aria-current={active ? "page" : undefined}
                        aria-describedby={expanded ? undefined : tooltipId}
                        data-shell-navigation-item="true"
                        onClick={(event) => {
                          onNavigate?.(item, event);
                          if (!event.defaultPrevented || compact) {
                            onOverlayOpenChange(false);
                          }
                        }}
                      >
                        {itemContent(item, tooltipId)}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <div className="app-sidebar__footer">
        {footer ? <div className="app-sidebar__footer-slot">{footer}</div> : null}
        <button
          className="app-sidebar__collapse"
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          aria-label={
            expanded ? messages.collapseNavigation : messages.expandNavigation
          }
          onClick={() => onExpandedChange(!expanded)}
        >
          <ChevronIcon expanded={expanded} />
          <span className="app-sidebar__collapse-label">
            {expanded
              ? messages.collapseNavigation
              : messages.expandNavigation}
          </span>
        </button>
      </div>
    </aside>
  );
}
