import { Toaster as Sonner, toast } from "sonner";

function Toaster() {
  return (
    <Sonner
      duration={5_000}
      expand={false}
      gap={8}
      mobileOffset={{
        bottom: "calc(var(--product-floating-action-clearance) + 0.75rem)",
        right: "1rem",
      }}
      offset={{
        bottom: "calc(var(--product-floating-action-clearance) + 0.75rem)",
        right: "var(--product-floating-action-inline-inset)",
      }}
      position="bottom-right"
      visibleToasts={3}
      toastOptions={{
        classNames: {
          toast: "bg-popover text-popover-foreground border-border",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
        },
      }}
    />
  );
}

export { Toaster, toast };
