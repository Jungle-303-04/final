import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

type CardSize = "default" | "sm";
type SlottedDivProps = ComponentProps<"div"> & { "data-slot"?: never };
type CardProps = SlottedDivProps & {
  "data-size"?: never;
  size?: CardSize;
};

function Card({
  className,
  size = "default",
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-card border border-border bg-card py-(--card-spacing) text-body text-card-foreground shadow-none [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 forced-colors:border forced-colors:border-[CanvasText] forced-colors:ring-0 *:[img:first-child]:rounded-t-card *:[img:last-child]:rounded-b-card",
        className,
      )}
      data-size={size}
      data-slot="card"
    />
  );
}

function CardHeader({ className, ...props }: SlottedDivProps) {
  return (
    <div
      {...props}
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-card px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className,
      )}
      data-slot="card-header"
    />
  );
}

function CardTitle({ className, ...props }: SlottedDivProps) {
  return (
    <div
      {...props}
      className={cn(
        "font-heading text-body-strong font-semibold leading-snug group-data-[size=sm]/card:text-body",
        className,
      )}
      data-slot="card-title"
    />
  );
}

function CardDescription({ className, ...props }: SlottedDivProps) {
  return (
    <div
      {...props}
      className={cn("text-body text-muted-foreground", className)}
      data-slot="card-description"
    />
  );
}

function CardAction({ className, ...props }: SlottedDivProps) {
  return (
    <div
      {...props}
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      data-slot="card-action"
    />
  );
}

function CardContent({ className, ...props }: SlottedDivProps) {
  return (
    <div
      {...props}
      className={cn("px-(--card-spacing)", className)}
      data-slot="card-content"
    />
  );
}

function CardFooter({ className, ...props }: SlottedDivProps) {
  return (
    <div
      {...props}
      className={cn(
        "flex items-center rounded-b-card border-t bg-muted/50 p-(--card-spacing)",
        className,
      )}
      data-slot="card-footer"
    />
  );
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
