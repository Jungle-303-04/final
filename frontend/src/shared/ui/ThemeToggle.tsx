import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useI18n, type MessageKey } from "../i18n";
import { Button } from "./primitives/button";
import { cn } from "./primitives/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./primitives/popover";
import type { ProductThemeController, ProductThemeSelection } from "./useProductTheme";

const themeOptions = [
  { icon: Monitor, label: "shell.theme.system", value: "system" },
  { icon: Moon, label: "shell.theme.dark", value: "dark" },
  { icon: Sun, label: "shell.theme.light", value: "light" },
] as const satisfies readonly {
  icon: LucideIcon;
  label: MessageKey;
  value: ProductThemeSelection;
}[];

export function ThemeToggle({ controller }: { controller: ProductThemeController }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const TriggerIcon = themeOptions.find((option) => option.value === controller.selection)?.icon
    ?? Monitor;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={<Button
          aria-keyshortcuts="t"
          aria-label={t("shell.theme.choose")}
          size="icon"
          variant="ghost"
        />}
      >
        <TriggerIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t("shell.theme.choose")}
        className="w-40 p-1"
      >
        {themeOptions.map(({ icon: Icon, label, value }) => {
          const selected = controller.selection === value;
          return (
            <Button
              aria-pressed={selected}
              className={cn("w-full justify-start", selected && "bg-accent")}
              key={value}
              onClick={() => {
                controller.select(value);
                setOpen(false);
              }}
              variant="ghost"
            >
              <Icon aria-hidden="true" data-icon="inline-start" />
              <span>{t(label)}</span>
              {selected ? <Check aria-hidden="true" className="ml-auto" /> : null}
            </Button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
