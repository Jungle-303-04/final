import { useCallback } from "react";
import { useTheme } from "next-themes";

export interface ProductThemeController {
  isDark: boolean;
  label: string;
  toggle: () => void;
}

export function useProductTheme(): ProductThemeController {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label = isDark ? "라이트 모드로 전환" : "다크 모드로 전환";
  const toggle = useCallback(() => {
    setTheme(isDark ? "light" : "dark");
  }, [isDark, setTheme]);

  return { isDark, label, toggle };
}
