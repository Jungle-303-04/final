import { Moon, Sun } from "lucide-react";
import { Toggle } from "./primitives/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "./primitives/tooltip";
import type { ProductThemeController } from "./useProductTheme";

export function ThemeToggle({ controller }: { controller: ProductThemeController }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Toggle
            aria-keyshortcuts="t"
            aria-label={controller.label}
            pressed={controller.isDark}
            size="icon"
            onPressedChange={controller.toggle}
          />
        )}
      >
        {controller.isDark
          ? <Sun aria-hidden="true" data-icon="inline-start" />
          : <Moon aria-hidden="true" data-icon="inline-start" />}
      </TooltipTrigger>
      <TooltipContent side="bottom">{controller.label}</TooltipContent>
    </Tooltip>
  );
}
