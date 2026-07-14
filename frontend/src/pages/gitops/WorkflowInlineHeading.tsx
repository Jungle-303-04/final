import type { ReactNode } from "react";
import { cn } from "../../shared/ui/primitives/cn";

type HeadingTag = "h1" | "h2" | "h3" | "strong";
type HeadingVariant = "page" | "section" | "compact";

const variantStyles: Record<HeadingVariant, {
  description: string;
  icon: string;
  title: string;
}> = {
  page: {
    description: "text-sm",
    icon: "size-10 rounded-xl border bg-card shadow-sm [&_svg]:size-5",
    title: "text-xl",
  },
  section: {
    description: "text-xs",
    icon: "size-9 rounded-lg bg-primary/10 [&_svg]:size-4",
    title: "text-base",
  },
  compact: {
    description: "text-xs",
    icon: "size-8 rounded-lg bg-primary/10 [&_svg]:size-4",
    title: "text-sm",
  },
};

export function WorkflowInlineHeading({
  as = "h2",
  className,
  description,
  icon,
  title,
  titleId,
  variant = "section",
}: {
  as?: HeadingTag;
  className?: string;
  description?: string;
  icon?: ReactNode;
  title: string;
  titleId?: string;
  variant?: HeadingVariant;
}) {
  const Heading = as;
  const styles = variantStyles[variant];
  return (
    <div className={cn("flex min-w-0 items-center gap-3 overflow-hidden", className)}>
      {icon ? (
        <span className={cn("grid shrink-0 place-items-center text-primary", styles.icon)}>
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
        <Heading
          className={cn(
            "m-0 min-w-0 truncate font-semibold whitespace-nowrap",
            description ? "max-w-[55%] shrink-0" : "flex-1",
            styles.title,
          )}
          id={titleId}
          title={title}
        >
          {title}
        </Heading>
        {description ? (
          <span
            className={cn("min-w-0 flex-1 truncate text-muted-foreground", styles.description)}
            title={description}
          >
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
}
