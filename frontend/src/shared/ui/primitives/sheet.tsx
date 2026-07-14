import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
  DEFAULT_LOCALE,
  translate,
  useOptionalI18n,
  type TranslationFunction,
} from "../../i18n";
import { Button } from "./button";
import { cn } from "@/shared/lib/cn";

type OwnedSlot<T> = Omit<T, "data-slot"> & { "data-slot"?: never };

export type SheetSide = "top" | "right" | "bottom" | "left";

const sheetSideClassName: Record<SheetSide, string> = {
  top: "inset-x-0 top-0 h-auto w-full border-b data-ending-style:-translate-y-10 data-starting-style:-translate-y-10",
  right: "inset-y-0 right-0 h-full w-full border-l data-ending-style:translate-x-10 data-starting-style:translate-x-10 sm:max-w-sm",
  bottom: "inset-x-0 bottom-0 h-auto w-full border-t data-ending-style:translate-y-10 data-starting-style:translate-y-10",
  left: "inset-y-0 left-0 h-full w-full border-r data-ending-style:-translate-x-10 data-starting-style:-translate-x-10 sm:max-w-sm",
};

type SheetContentProps = Omit<
  OwnedSlot<SheetPrimitive.Popup.Props>,
  "data-side"
> & {
  "data-side"?: never;
  closeLabel?: string;
  showCloseButton?: boolean;
  side?: SheetSide;
};

function Sheet<Payload = unknown>(
  props: OwnedSlot<SheetPrimitive.Root.Props<Payload>>,
) {
  return <SheetPrimitive.Root {...props} data-slot="sheet" />;
}

function SheetTrigger<Payload = unknown>(
  props: OwnedSlot<SheetPrimitive.Trigger.Props<Payload>>,
) {
  return <SheetPrimitive.Trigger {...props} data-slot="sheet-trigger" />;
}

function SheetClose(props: OwnedSlot<SheetPrimitive.Close.Props>) {
  return <SheetPrimitive.Close {...props} data-slot="sheet-close" />;
}

function SheetPortal(props: OwnedSlot<SheetPrimitive.Portal.Props>) {
  return <SheetPrimitive.Portal {...props} data-slot="sheet-portal" />;
}

function SheetOverlay({
  className,
  ...props
}: OwnedSlot<SheetPrimitive.Backdrop.Props>) {
  return (
    <SheetPrimitive.Backdrop
      {...props}
      className={cn(
        "fixed inset-0 isolate z-50 min-h-dvh bg-foreground/10 transition-opacity duration-150 supports-backdrop-filter:backdrop-blur-xs data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none forced-colors:bg-[Canvas] forced-colors:opacity-75",
        className,
      )}
      data-slot="sheet-overlay"
    />
  );
}

function SheetContent({
  children,
  className,
  closeLabel,
  showCloseButton = true,
  side = "right",
  ...props
}: SheetContentProps) {
  const t = usePrimitiveTranslation();
  const resolvedCloseLabel = closeLabel?.trim() || t("common.action.close");
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        {...props}
        className={cn(
          "fixed isolate z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition duration-200 ease-in-out outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:duration-0 motion-reduce:transition-none forced-colors:border forced-colors:border-[CanvasText] forced-colors:shadow-none",
          sheetSideClassName[side],
          className,
        )}
        data-side={side}
        data-slot="sheet-content"
      >
        {children}
        {showCloseButton ? (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={(
              <Button
                className="absolute top-3 right-3 forced-colors:border forced-colors:border-[ButtonBorder] forced-colors:text-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-[Highlight]"
                size="icon-sm"
                variant="ghost"
              />
            )}
          >
            <XIcon aria-hidden="true" data-icon="inline-start" />
            <span className="sr-only">{resolvedCloseLabel}</span>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function usePrimitiveTranslation(): TranslationFunction {
  return useOptionalI18n()?.t ?? fallbackTranslate;
}

const fallbackTranslate: TranslationFunction = (key, params) =>
  translate(DEFAULT_LOCALE, key, params);

function SheetHeader({
  className,
  ...props
}: OwnedSlot<ComponentProps<"div">>) {
  return (
    <div
      {...props}
      className={cn("flex flex-col gap-1 p-4", className)}
      data-slot="sheet-header"
    />
  );
}

function SheetFooter({
  className,
  ...props
}: OwnedSlot<ComponentProps<"div">>) {
  return (
    <div
      {...props}
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      data-slot="sheet-footer"
    />
  );
}

function SheetTitle({
  className,
  ...props
}: OwnedSlot<SheetPrimitive.Title.Props>) {
  return (
    <SheetPrimitive.Title
      {...props}
      className={cn("font-heading text-base font-medium text-foreground", className)}
      data-slot="sheet-title"
    />
  );
}

function SheetDescription({
  className,
  ...props
}: OwnedSlot<SheetPrimitive.Description.Props>) {
  return (
    <SheetPrimitive.Description
      {...props}
      className={cn("text-sm text-muted-foreground", className)}
      data-slot="sheet-description"
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
