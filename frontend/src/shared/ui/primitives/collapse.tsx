import { ChevronRightIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface CollapseProps {
  children: ReactNode;
  className?: string;
  mountLazily?: boolean;
  open: boolean;
}

function Collapse({
  children,
  className,
  mountLazily = false,
  open,
}: CollapseProps) {
  const [hasOpened, setHasOpened] = useState(open);
  if (open && !hasOpened) setHasOpened(true);

  const shouldRender = !mountLazily || hasOpened;
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-(--motion-quick) ease-(--ease-out) motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className,
      )}
      data-slot="collapse"
      data-state={open ? "open" : "closed"}
    >
      <div
        aria-hidden={open ? undefined : true}
        className="min-h-0 overflow-hidden"
        data-slot="collapse-content"
        inert={!open || undefined}
      >
        {shouldRender ? children : null}
      </div>
    </div>
  );
}

function CollapseChevron({
  className,
  open,
}: {
  className?: string;
  open: boolean;
}) {
  return (
    <ChevronRightIcon
      aria-hidden="true"
      className={cn(
        "shrink-0 text-muted-foreground transition-transform duration-(--motion-quick) motion-reduce:transition-none",
        open && "rotate-90",
        className,
      )}
      data-slot="collapse-chevron"
    />
  );
}

export { Collapse, CollapseChevron };
export type { CollapseProps };
