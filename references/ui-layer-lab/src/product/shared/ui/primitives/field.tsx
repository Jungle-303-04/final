import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

type Slotted<T> = T & { "data-slot"?: never };

function FieldSet({ className, ...props }: Slotted<ComponentProps<"fieldset">>) {
  return (
    <fieldset
      {...props}
      className={cn("flex min-w-0 flex-col gap-4", className)}
      data-slot="field-set"
    />
  );
}

function FieldLegend({ className, ...props }: Slotted<ComponentProps<"legend">>) {
  return (
    <legend
      {...props}
      className={cn("mb-1.5 text-base font-medium", className)}
      data-slot="field-legend"
    />
  );
}

function FieldGroup({ className, ...props }: Slotted<ComponentProps<"div">>) {
  return (
    <div
      {...props}
      className={cn("flex w-full min-w-0 flex-col gap-5", className)}
      data-slot="field-group"
    />
  );
}

const fieldVariants = cva(
  "group/field flex w-full min-w-0 gap-2 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
        horizontal: "flex-row items-center",
      },
    },
    defaultVariants: { orientation: "vertical" },
  },
);

type FieldProps = Slotted<Omit<ComponentProps<"div">, "role">> &
  VariantProps<typeof fieldVariants> & { role?: never };

function Field({ className, orientation = "vertical", ...props }: FieldProps) {
  return (
    <div
      {...props}
      className={cn(fieldVariants({ orientation }), className)}
      data-orientation={orientation}
      data-slot="field"
      role="group"
    />
  );
}

function FieldContent({ className, ...props }: Slotted<ComponentProps<"div">>) {
  return (
    <div
      {...props}
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5 leading-snug", className)}
      data-slot="field-content"
    />
  );
}

function FieldLabel({ className, ...props }: Slotted<ComponentProps<"label">>) {
  return (
    <label
      {...props}
      className={cn(
        "flex w-fit items-center gap-2 text-sm font-medium leading-snug group-data-[disabled=true]/field:opacity-50",
        className,
      )}
      data-slot="field-label"
    />
  );
}

function FieldDescription({ className, ...props }: Slotted<ComponentProps<"p">>) {
  return (
    <p
      {...props}
      className={cn(
        "text-left text-sm font-normal leading-normal text-muted-foreground",
        className,
      )}
      data-slot="field-description"
    />
  );
}

type FieldErrorProps = Slotted<Omit<ComponentProps<"div">, "role">> & { role?: never };

function FieldError({ children, className, ...props }: FieldErrorProps) {
  if (!children) return null;
  return (
    <div
      {...props}
      className={cn("text-sm font-normal text-destructive", className)}
      data-slot="field-error"
      role="alert"
    >
      {children}
    </div>
  );
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
};
