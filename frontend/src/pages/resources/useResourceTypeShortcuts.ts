import { useEffect } from "react";

export function useResourceTypeShortcuts(cycle: (direction: -1 | 1) => void) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditingTarget(event.target) ||
        document.querySelector('[role="dialog"]')
      ) return;
      if (event.key !== "[" && event.key !== "]") return;
      event.preventDefault();
      cycle(event.key === "]" ? 1 : -1);
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [cycle]);
}

function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    target.matches("input, textarea, select, [contenteditable=true]");
}
