import { useCallback } from "react";
import { useTheme } from "next-themes";
import { useI18n } from "../i18n";

export interface ProductThemeController {
  isDark: boolean;
  label: string;
  toggle: () => void;
}

export type ProductColorMode = "light" | "dark";

export function resolveProductColorMode(resolvedTheme?: string): ProductColorMode {
  return resolvedTheme === "light" ? "light" : "dark";
}

export function useProductColorMode(): ProductColorMode {
  const { resolvedTheme } = useTheme();
  return resolveProductColorMode(resolvedTheme);
}

export function useProductTheme(): ProductThemeController {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const isDark = resolveProductColorMode(resolvedTheme) === "dark";
  const label = isDark ? t("shell.theme.switchToLight") : t("shell.theme.switchToDark");
  const toggle = useCallback(() => {
    setTheme(isDark ? "light" : "dark");
  }, [isDark, setTheme]);

  return { isDark, label, toggle };
}
