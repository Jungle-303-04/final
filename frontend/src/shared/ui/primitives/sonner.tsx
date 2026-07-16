import { Toaster as Sonner, toast } from "sonner";

function Toaster() {
  return (
    <Sonner
      duration={5_000}
      expand={false}
      gap={8}
      mobileOffset={{
        top: "calc(3.5rem + 0.75rem + env(safe-area-inset-top, 0px))",
        right: "1rem",
      }}
      offset={{
        top: "calc(3.5rem + 0.75rem + env(safe-area-inset-top, 0px))",
        right: "var(--product-floating-action-inline-inset)",
      }}
      position="top-right"
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
