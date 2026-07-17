import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export type UnifiedDiffLineKind = "addition" | "context" | "header" | "removal";

export interface UnifiedDiffLineClassification {
  isAddition: boolean;
  isHeader: boolean;
  isRemoval: boolean;
  kind: UnifiedDiffLineKind;
}

export function classifyUnifiedDiffLine(line: string): UnifiedDiffLineClassification {
  const isAddition = line.startsWith("+") && !line.startsWith("+++");
  const isRemoval = line.startsWith("-") && !line.startsWith("---");
  const isHeader = line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++");
  return {
    isAddition,
    isHeader,
    isRemoval,
    kind: isAddition ? "addition" : isRemoval ? "removal" : isHeader ? "header" : "context",
  };
}

export function hasUnifiedDiffBodyChange(diff: string): boolean {
  return diff.split("\n").some((line) => {
    const classification = classifyUnifiedDiffLine(line);
    return classification.isAddition || classification.isRemoval;
  });
}

export interface UnifiedDiffProps extends Omit<ComponentProps<"div">, "children"> {
  diff: string;
  numbered?: boolean;
  wrap?: boolean;
}

export function UnifiedDiff({
  className,
  diff,
  numbered = false,
  wrap = false,
  ...props
}: UnifiedDiffProps) {
  return (
    <div
      className={cn("overflow-auto font-mono text-xs leading-5", className)}
      data-slot="unified-diff"
      {...props}
    >
      {diff.split("\n").map((line, index) => (
        <UnifiedDiffLine
          key={`${index}:${line}`}
          line={line}
          lineNumber={numbered ? index + 1 : undefined}
          wrap={wrap}
        />
      ))}
    </div>
  );
}

export function UnifiedDiffLine({
  className,
  line,
  lineNumber,
  wrap = false,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  line: string;
  lineNumber?: number;
  wrap?: boolean;
}) {
  const classification = classifyUnifiedDiffLine(line);
  return (
    <div
      className={cn(
        "flex",
        wrap ? "min-w-0" : "min-w-max",
        classification.kind === "addition" && "bg-status-healthy/10 text-status-healthy",
        classification.kind === "removal" && "bg-destructive/10 text-destructive",
        classification.kind === "header" && "bg-muted/50 font-semibold text-muted-foreground",
        classification.kind === "context" && "text-muted-foreground",
        className,
      )}
      data-diff-kind={classification.kind}
      data-slot="unified-diff-line"
      {...props}
    >
      {lineNumber === undefined ? null : (
        <span
          aria-hidden="true"
          className="w-12 shrink-0 border-r border-border/50 px-2 text-right text-muted-foreground select-none"
        >
          {lineNumber}
        </span>
      )}
      <span className={cn("flex-1 px-2", wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre")}>
        {line || " "}
      </span>
    </div>
  );
}
