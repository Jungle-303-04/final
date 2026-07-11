import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  createShortcutMatcher,
  type ShortcutDefinition,
} from "./shortcutRegistry";

interface ProductShortcutOptions {
  definitions: readonly ShortcutDefinition[];
  isHelpOpen: boolean;
  onHelpToggle: () => void;
  onThemeToggle: () => void;
}

export function useProductShortcuts({
  definitions,
  isHelpOpen,
  onHelpToggle,
  onThemeToggle,
}: ProductShortcutOptions) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const matcher = createShortcutMatcher(definitions);

    const focusMain = () => {
      queueMicrotask(() => document.getElementById("product-main")?.focus());
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isHelpOpen && event.key !== "?") {
        matcher.reset();
        return;
      }

      const definition = matcher.handle(event);
      if (!definition) return;

      if (definition.id.startsWith("route:") && definition.targetPath) {
        if (location.pathname !== definition.targetPath) navigate(definition.targetPath);
        focusMain();
        return;
      }

      if (definition.id === "theme") {
        onThemeToggle();
        return;
      }

      if (definition.id === "help") onHelpToggle();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") matcher.reset();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", matcher.reset);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", matcher.reset);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      matcher.dispose();
    };
  }, [definitions, isHelpOpen, location.pathname, navigate, onHelpToggle, onThemeToggle]);
}
