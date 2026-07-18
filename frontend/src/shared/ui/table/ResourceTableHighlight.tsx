import { Fragment } from "react";

import { cn } from "@/shared/lib/cn";

export function ResourceTableHighlight({
  className,
  query,
  text,
}: {
  className?: string;
  query?: string;
  text: string;
}) {
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) {
    return <span className={cn("truncate", className)}>{text}</span>;
  }

  const start = text.toLocaleLowerCase().indexOf(
    normalizedQuery.toLocaleLowerCase(),
  );
  if (start < 0) {
    return <span className={cn("truncate", className)}>{text}</span>;
  }
  const end = start + normalizedQuery.length;

  return (
    <span className={cn("truncate", className)}>
      <Fragment>{text.slice(0, start)}</Fragment>
      <mark className="rounded-sm bg-primary/12 px-0.5 text-foreground">
        {text.slice(start, end)}
      </mark>
      <Fragment>{text.slice(end)}</Fragment>
    </span>
  );
}
