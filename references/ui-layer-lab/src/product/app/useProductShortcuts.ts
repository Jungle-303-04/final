import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  createShortcutMatcher,
  isProductContextShortcutId,
  PRODUCT_SHORTCUT_EVENT,
  type ProductShortcutEventDetail,
  type ShortcutDefinition,
} from "./shortcutRegistry";
import { productNavigationHref } from "../features/cluster-scope/clusterScopeUrl";

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
      if (!isHelpOpen && document.querySelector('[role="dialog"]')) {
        matcher.reset();
        return;
      }

      const definition = matcher.handle(event);
      if (!definition) return;

      if (definition.id.startsWith("route:") && definition.targetPath) {
        const target = productNavigationHref(definition.targetPath, location.search);
        if (`${location.pathname}${location.search}` !== target) navigate(target);
        focusMain();
        return;
      }

      if (isProductContextShortcutId(definition.id)) {
        window.dispatchEvent(new CustomEvent<ProductShortcutEventDetail>(
          PRODUCT_SHORTCUT_EVENT,
          { detail: { id: definition.id } },
        ));
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
  }, [
    definitions,
    isHelpOpen,
    location.pathname,
    location.search,
    navigate,
    onHelpToggle,
    onThemeToggle,
  ]);
}
