import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { Separator } from "./separator";

const ITEM_ELEMENTS = ["div", "a", "button"] as const;
const ITEM_VARIANTS = ["default", "outline", "muted"] as const;
const ITEM_SIZES = ["default", "sm", "xs"] as const;
const ITEM_MEDIA_VARIANTS = ["default", "icon", "image"] as const;
const ITEM_NEUTRAL_ROLES = ["article", "group", "listitem", "none", "presentation", "row", "treeitem"] as const;
export type ItemElement = (typeof ITEM_ELEMENTS)[number];
export type ItemVariant = (typeof ITEM_VARIANTS)[number];
export type ItemSize = (typeof ITEM_SIZES)[number];
export type ItemMediaVariant = (typeof ITEM_MEDIA_VARIANTS)[number];

type OwnedItemData = {
  "data-size"?: never;
  "data-slot"?: never;
  "data-variant"?: never;
};
type SharedItemProps = OwnedItemData & {
  children?: ReactNode;
  className?: string;
  size?: ItemSize;
  variant?: ItemVariant;
};
type NativeItemKeys = "children" | "className" | "data-size" | "data-slot" | "data-variant";
type NeutralItemRole = (typeof ITEM_NEUTRAL_ROLES)[number];
type DivItemProps = SharedItemProps &
  Omit<ComponentProps<"div">, NativeItemKeys | "onClick" | "role" | "tabIndex"> & {
    as?: "div";
    onClick?: never;
    role?: NeutralItemRole;
    tabIndex?: never;
  };
type LinkItemProps = SharedItemProps &
  Omit<ComponentProps<"a">, NativeItemKeys | "href" | "role"> & {
    as: "a";
    href: string;
    role?: never;
  };
type ButtonItemProps = SharedItemProps &
  Omit<ComponentProps<"button">, NativeItemKeys | "role" | "type"> & {
    as: "button";
    role?: never;
    type?: never;
  };

export type ItemProps = DivItemProps | LinkItemProps | ButtonItemProps;

const itemVariants = cva(
  "group/item flex w-full flex-wrap items-center rounded-lg border text-sm transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default: "border-transparent",
        outline: "border-border",
        muted: "border-transparent bg-muted/50",
      },
      size: {
        default: "gap-2.5 px-3 py-2.5",
        sm: "gap-2.5 px-3 py-2.5",
        xs: "gap-2 px-2.5 py-2 in-data-[slot=dropdown-menu-content]:p-0",
      },
    },
    defaultVariants: { size: "default", variant: "default" },
  },
);
const itemMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "[&_svg:not([class*='size-'])]:size-4",
        image:
          "size-10 overflow-hidden rounded-sm group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 [&_img]:size-full [&_img]:object-cover",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Item({
  as = "div",
  children,
  className,
  size = "default",
  variant = "default",
  ...elementProps
}: ItemProps) {
  assertChoice(as, isItemElement, "Item as must be div, a, or button");
  assertChoice(size, isItemSize, "Item size must be default, sm, or xs");
  assertChoice(
    variant,
    isItemVariant,
    "Item variant must be default, outline, or muted",
  );
  const rootProps = {
    className: cn(
      itemVariants({ size, variant }),
      as === "div"
        ? undefined
        : "cursor-pointer hover:bg-muted disabled:pointer-events-none disabled:opacity-50 forced-colors:disabled:border-[GrayText] forced-colors:disabled:text-[GrayText] forced-colors:disabled:opacity-100",
      className,
    ),
    "data-size": size,
    "data-slot": "item",
    "data-variant": variant,
  } as const;

  if (as === "a") {
    assertAbsent(elementProps, "role", "Link Item owns native link semantics");
    const { href, ...anchorProps } = elementProps as Record<string, unknown>;
    return (
      <a
        {...(anchorProps as ComponentProps<"a">)}
        {...rootProps}
        href={normalizeHref(href)}
      >
        {children}
      </a>
    );
  }
  if (as === "button") {
    assertAbsent(elementProps, "role", "Button Item owns native button semantics");
    assertAbsent(elementProps, "type", "Button Item owns type=button");
    return (
      <button
        {...(elementProps as ComponentProps<"button">)}
        {...rootProps}
        type="button"
      >
        {children}
      </button>
    );
  }

  assertAbsent(elementProps, "onClick", "Div Item cannot receive onClick");
  assertAbsent(elementProps, "tabIndex", "Div Item cannot receive tabIndex");
  const neutralRole = (elementProps as { role?: unknown }).role;
  if (neutralRole !== undefined) {
    assertChoice(
      neutralRole,
      isNeutralItemRole,
      "Div Item role must be neutral and context-owned",
    );
  }
  return (
    <div {...(elementProps as ComponentProps<"div">)} {...rootProps}>
      {children}
    </div>
  );
}

type OwnedSlot = { "data-slot"?: never };
type DivSlotProps = OwnedSlot & Omit<ComponentProps<"div">, "data-slot">;
type ParagraphSlotProps = OwnedSlot & Omit<ComponentProps<"p">, "data-slot">;

export function ItemGroup({
  className,
  ...props
}: OwnedSlot &
  Omit<
    ComponentProps<"div">,
    "data-slot" | "onClick" | "role" | "tabIndex"
  > & {
    onClick?: never;
    role?: never;
    tabIndex?: never;
  }) {
  assertAbsent(props, "onClick", "ItemGroup cannot receive onClick");
  assertAbsent(props, "role", "ItemGroup leaves semantics to its owner");
  assertAbsent(props, "tabIndex", "ItemGroup cannot enter the tab order");
  return (
    <div
      {...props}
      className={cn(
        "group/item-group flex w-full flex-col gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2",
        className,
      )}
      data-slot="item-group"
    />
  );
}

export function ItemSeparator({
  className,
  ...props
}: OwnedSlot &
  Omit<ComponentProps<typeof Separator>, "data-slot" | "orientation">) {
  return (
    <Separator
      {...props}
      className={cn("my-2", className)}
      data-slot="item-separator"
      orientation="horizontal"
    />
  );
}

export function ItemMedia({
  className,
  variant = "default",
  ...props
}: DivSlotProps & { "data-variant"?: never; variant?: ItemMediaVariant }) {
  assertChoice(
    variant,
    isItemMediaVariant,
    "ItemMedia variant must be default, icon, or image",
  );
  return (
    <div
      {...props}
      className={cn(itemMediaVariants({ variant }), className)}
      data-slot="item-media"
      data-variant={variant}
    />
  );
}

export function ItemContent(props: DivSlotProps) {
  return <DivSlot {...props} base="flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0 [&+[data-slot=item-content]]:flex-none" slot="item-content" />;
}
export function ItemTitle(props: DivSlotProps) {
  return <DivSlot {...props} base="line-clamp-1 flex w-fit items-center gap-2 text-sm leading-snug font-medium underline-offset-4" slot="item-title" />;
}
export function ItemActions(props: DivSlotProps) {
  return <DivSlot {...props} base="flex items-center gap-2" slot="item-actions" />;
}
export function ItemHeader(props: DivSlotProps) {
  return <DivSlot {...props} base="flex basis-full items-center justify-between gap-2" slot="item-header" />;
}
export function ItemFooter(props: DivSlotProps) {
  return <DivSlot {...props} base="flex basis-full items-center justify-between gap-2" slot="item-footer" />;
}
export function ItemDescription({ className, ...props }: ParagraphSlotProps) {
  return (
    <p
      {...props}
      className={cn(
        "line-clamp-2 text-left text-sm leading-normal font-normal text-muted-foreground group-data-[size=xs]/item:text-xs [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      data-slot="item-description"
    />
  );
}

function DivSlot({
  base,
  className,
  slot,
  ...props
}: DivSlotProps & { base: string; slot: string }) {
  return <div {...props} className={cn(base, className)} data-slot={slot} />;
}

export function isItemElement(value: unknown): value is ItemElement {
  return isChoice(value, ITEM_ELEMENTS);
}
export function isItemVariant(value: unknown): value is ItemVariant {
  return isChoice(value, ITEM_VARIANTS);
}
export function isItemSize(value: unknown): value is ItemSize {
  return isChoice(value, ITEM_SIZES);
}
export function isItemMediaVariant(value: unknown): value is ItemMediaVariant {
  return isChoice(value, ITEM_MEDIA_VARIANTS);
}
function isNeutralItemRole(value: unknown): value is NeutralItemRole {
  return isChoice(value, ITEM_NEUTRAL_ROLES);
}
function isChoice<Choice extends string>(
  value: unknown,
  choices: readonly Choice[],
): value is Choice {
  return typeof value === "string" && choices.includes(value as Choice);
}
function assertChoice<Choice extends string>(
  value: unknown,
  guard: (candidate: unknown) => candidate is Choice,
  message: string,
): asserts value is Choice {
  if (!guard(value)) throw new TypeError(message);
}
function assertAbsent(value: object, key: PropertyKey, message: string): void {
  if (Object.prototype.hasOwnProperty.call(value, key)) throw new TypeError(message);
}
function normalizeHref(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Link Item requires a non-empty href");
  }
  return value.trim();
}
