import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "./primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./primitives/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const label = isDark ? "라이트 모드로 전환" : "다크 모드로 전환";

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            aria-label={label}
            aria-pressed={isDark}
            size="icon"
            variant="ghost"
            onClick={() => setTheme(nextTheme)}
          />
        )}
      >
        {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
