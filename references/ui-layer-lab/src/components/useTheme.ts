import { useEffect, useMemo, useState } from "react";

export type ThemeName = "dark" | "light";

const storageKey = "ui-layer-lab-theme";

function initialTheme(): ThemeName {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(storageKey);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(() => initialTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(storageKey, theme);
  }, [theme]);

  return useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((value) => (value === "dark" ? "light" : "dark"))
    }),
    [theme]
  );
}
