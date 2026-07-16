import { Toaster as Sonner, toast } from "sonner";
import { SuccessCheckIcon } from "../SuccessCheckIcon";

function Toaster() {
  return (
    <Sonner
      closeButton
      icons={{ success: <SuccessCheckIcon /> }}
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
