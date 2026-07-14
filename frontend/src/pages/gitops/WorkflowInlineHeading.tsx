import type { ReactNode } from "react";
import { cn } from "../../shared/ui/primitives/cn";

type HeadingTag = "h1" | "h2" | "h3" | "strong";
type HeadingVariant = "page" | "section" | "compact";

const variantStyles: Record<HeadingVariant, {
  icon: string;
  title: string;
}> = {
  page: {
    icon: "size-10 rounded-xl border bg-card shadow-sm [&_svg]:size-5",
    title: "text-xl",
  },
  section: {
    icon: "size-9 rounded-lg bg-primary/10 [&_svg]:size-4",
    title: "text-base",
  },
  compact: {
    icon: "size-8 rounded-lg bg-primary/10 [&_svg]:size-4",
    title: "text-sm",
  },
};

export function WorkflowInlineHeading({
  as = "h2",
  className,
  icon,
  title,
  titleId,
  variant = "section",
}: {
  as?: HeadingTag;
  className?: string;
  icon?: ReactNode;
  title: string;
  titleId?: string;
  variant?: HeadingVariant;
}) {
  const Heading = as;
  const styles = variantStyles[variant];
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {icon ? (
        <span className={cn("grid shrink-0 place-items-center text-primary", styles.icon)}>
          {icon}
        </span>
      ) : null}
      <div className="grid min-w-0 flex-1">
        <Heading
          className={cn(
            "m-0 min-w-0 font-semibold [overflow-wrap:anywhere]",
            styles.title,
          )}
          id={titleId}
        >
          {title}
        </Heading>
      </div>
    </div>
  );
}
