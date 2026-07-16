import { cn } from "@/shared/lib/cn";

export function SuccessCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("motion-success-check size-5", className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="motion-success-check-ring" cx="12" cy="12" r="9" />
      <path className="motion-success-check-mark" d="m8 12.2 2.6 2.6L16.5 9" />
    </svg>
  );
}
