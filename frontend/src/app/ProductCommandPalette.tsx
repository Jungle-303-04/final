import { useMemo } from "react";
import { Kbd } from "../shared/ui/primitives/kbd";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../shared/ui/primitives/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../shared/ui/primitives/dialog";
import { useI18n } from "../shared/i18n";
import type { ProductRouteDefinition, ProductSurfaceId } from "./productRoutes";
import { navLabelKeys, routeIcons } from "./ProductShellNavigation";

interface ProductCommandPaletteProps {
  availableSurfaceIds: ReadonlySet<ProductSurfaceId>;
  onOpenChange: (open: boolean) => void;
  onSelectRoute: (routeDefinition: ProductRouteDefinition) => boolean;
  open: boolean;
  routeDefinitions: readonly ProductRouteDefinition[];
}

/**
 * A route-catalog consumer. It intentionally contains no paths, labels, or
 * action identifiers; the descriptor remains the single navigation authority.
 */
export function ProductCommandPalette({
  availableSurfaceIds,
  onOpenChange,
  onSelectRoute,
  open,
  routeDefinitions,
}: ProductCommandPaletteProps) {
  const { t } = useI18n();
  const entries = useMemo(() => routeDefinitions.map((routeDefinition) => ({
    available: availableSurfaceIds.has(routeDefinition.id),
    routeDefinition,
  })), [availableSurfaceIds, routeDefinitions]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
        closeLabel={t("common.action.close")}
      >
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <DialogTitle>{t("shell.command.title")}</DialogTitle>
          <DialogDescription>{t("shell.command.description")}</DialogDescription>
        </DialogHeader>
        <Command label={t("shell.command.title")}>
          <CommandInput autoFocus placeholder={t("shell.command.input")} />
          <CommandList>
            <CommandEmpty>{t("shell.filter.empty")}</CommandEmpty>
            <CommandGroup heading={t("shell.command.navigation")}>
              {entries.map(({ available, routeDefinition }) => {
                const Icon = routeIcons[routeDefinition.icon];
                const label = t(navLabelKeys[routeDefinition.id]);
                return (
                  <CommandItem
                    key={routeDefinition.id}
                    onSelect={() => {
                      if (onSelectRoute(routeDefinition)) onOpenChange(false);
                    }}
                    value={`${label} ${routeDefinition.shortcut}`}
                  >
                    <Icon aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {available ? null : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t("shell.command.unavailable")}
                      </span>
                    )}
                    <Kbd>{routeDefinition.shortcut}</Kbd>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
