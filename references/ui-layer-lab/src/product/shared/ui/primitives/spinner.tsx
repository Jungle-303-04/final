import { Loader2Icon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "./cn";

type SpinnerProps = Omit<ComponentProps<"svg">, "aria-hidden"> & {
  decorative?: boolean;
};

function Spinner({
  "aria-label": ariaLabel,
  className,
  decorative = false,
  role,
  ...props
}: SpinnerProps) {
  return (
    <Loader2Icon
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : (ariaLabel ?? "로딩 중")}
      className={cn("size-4 motion-safe:animate-spin motion-reduce:animate-none", className)}
      data-slot="spinner"
      role={decorative ? undefined : (role ?? "status")}
      {...props}
    />
  );
}

export { Spinner };
