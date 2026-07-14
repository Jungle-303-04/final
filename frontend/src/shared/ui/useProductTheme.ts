import { useCallback } from "react";
import { useTheme } from "next-themes";

export interface ProductThemeController {
  isDark: boolean;
  selection: ProductThemeSelection;
  select: (selection: ProductThemeSelection) => void;
  toggle: () => void;
}

export type ProductColorMode = "light" | "dark";
export type ProductThemeSelection = ProductColorMode | "system";

export function resolveProductColorMode(resolvedTheme?: string): ProductColorMode {
  return resolvedTheme === "light" ? "light" : "dark";
}

export function resolveProductThemeSelection(theme?: string): ProductThemeSelection {
  return theme === "light" || theme === "dark" ? theme : "system";
}

export function useProductColorMode(): ProductColorMode {
  const { resolvedTheme } = useTheme();
  return resolveProductColorMode(resolvedTheme);
}

export function useProductTheme(): ProductThemeController {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const isDark = resolveProductColorMode(resolvedTheme) === "dark";
  const selection = resolveProductThemeSelection(theme);
  const select = useCallback((nextSelection: ProductThemeSelection) => {
    setTheme(nextSelection);
  }, [setTheme]);
  const toggle = useCallback(() => {
    const nextSelection: ProductThemeSelection = selection === "system"
      ? "dark"
      : selection === "dark"
        ? "light"
        : "system";
    setTheme(nextSelection);
  }, [selection, setTheme]);

  return { isDark, selection, select, toggle };
}
