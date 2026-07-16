import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Spinner } from "./spinner";

type ConfirmationDialogVariant = "destructive" | "warning";

interface ConfirmationDialogProps {
  cancelLabel: ReactNode;
  children?: ReactNode;
  className?: string;
  confirmDisabled?: boolean;
  confirmLabel: ReactNode;
  description: ReactNode;
  details?: ReactNode;
  dismissibleWhilePending?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  title: ReactNode;
  variant?: ConfirmationDialogVariant;
}

function ConfirmationDialog({
  cancelLabel,
  children,
  className,
  confirmDisabled = false,
  confirmLabel,
  description,
  details,
  dismissibleWhilePending = false,
  onConfirm,
  onOpenChange,
  open,
  pending = false,
  title,
  variant = "destructive",
}: ConfirmationDialogProps) {
  const dismissible = !pending || dismissibleWhilePending;
  const confirmUnavailable = pending || confirmDisabled;
  const tone = variant === "destructive" ? "text-destructive" : "text-warning-foreground";

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && !dismissible) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogContent
        className={cn("sm:max-w-md", className)}
        showCloseButton={dismissible}
      >
        <DialogHeader className="pr-8">
          <span className={cn("flex size-10 items-center justify-center rounded-full bg-muted", tone)}>
            <AlertTriangleIcon aria-hidden="true" className="size-5" />
          </span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {details ? (
          <pre className="max-h-32 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap">
            {details}
          </pre>
        ) : null}
        {children}
        <DialogFooter>
          <Button disabled={!dismissible} onClick={() => changeOpen(false)} variant="outline">
            {cancelLabel}
          </Button>
          <Button
            disabled={confirmUnavailable}
            onClick={onConfirm}
            variant={variant === "destructive" ? "destructive" : "default"}
          >
            {pending ? <Spinner data-icon="inline-start" decorative /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmationDialog };
export type { ConfirmationDialogProps, ConfirmationDialogVariant };
