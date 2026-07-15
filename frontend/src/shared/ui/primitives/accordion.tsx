import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";

type OwnedSlot<T> = Omit<T, "data-slot"> & { "data-slot"?: never };

function Accordion({
  className,
  ...props
}: OwnedSlot<AccordionPrimitive.Root.Props>) {
  return (
    <AccordionPrimitive.Root
      {...props}
      className={cn("flex w-full flex-col", className)}
      data-slot="accordion"
    />
  );
}

function AccordionItem({
  className,
  ...props
}: OwnedSlot<AccordionPrimitive.Item.Props>) {
  return (
    <AccordionPrimitive.Item
      {...props}
      className={cn(
        "not-last:border-b forced-colors:border-[CanvasText]",
        className,
      )}
      data-slot="accordion-item"
    />
  );
}

function AccordionTrigger({
  children,
  className,
  ...props
}: OwnedSlot<AccordionPrimitive.Trigger.Props>) {
  return (
    <AccordionPrimitive.Header className="flex" data-slot="accordion-header">
      <AccordionPrimitive.Trigger
        {...props}
        className={cn(
          "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-50 motion-reduce:transition-none forced-colors:hover:no-underline forced-colors:focus-visible:border-[Highlight] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-[Highlight] forced-colors:aria-disabled:text-[GrayText] forced-colors:aria-disabled:opacity-100 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground",
          className,
        )}
        data-slot="accordion-trigger"
      >
        {children}
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden forced-colors:text-[ButtonText]"
          data-slot="accordion-trigger-icon"
        />
        <ChevronUpIcon
          aria-hidden="true"
          className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline forced-colors:text-[ButtonText]"
          data-slot="accordion-trigger-icon"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  children,
  className,
  ...props
}: OwnedSlot<AccordionPrimitive.Panel.Props>) {
  return (
    <AccordionPrimitive.Panel
      {...props}
      className="overflow-hidden text-sm data-closed:animate-accordion-up data-open:animate-accordion-down motion-reduce:animate-none"
      data-slot="accordion-content"
    >
      <div
        className={cn(
          "h-(--accordion-panel-height) pt-0 pb-2.5 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:h-auto motion-reduce:transition-none motion-reduce:data-ending-style:h-auto motion-reduce:data-starting-style:h-auto [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
