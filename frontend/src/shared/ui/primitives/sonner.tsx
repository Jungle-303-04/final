import { Toaster as Sonner, toast } from "sonner";

function Toaster() {
  return (
    <Sonner
      closeButton
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: "bg-popover text-popover-foreground border-border",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}

export { Toaster, toast };
