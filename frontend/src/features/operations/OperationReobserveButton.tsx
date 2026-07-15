import { cn } from "../../shared/lib/cn";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { useOperationStatusStore } from "./OperationStatusStore";

export function OperationReobserveButton({
  commandId,
  enabled,
}: {
  commandId: string;
  enabled: boolean;
}) {
  const { t } = useI18n();
  const store = useOperationStatusStore();
  return (
    <Button
      aria-disabled={!enabled}
      className={cn(
        "h-7 shrink-0 px-2 text-xs",
        !enabled && "cursor-not-allowed opacity-60",
      )}
      onClick={() => {
        if (enabled) store.reobserve(commandId);
      }}
      type="button"
      variant="outline"
    >
      {t("resources.detail.action.reobserve")}
    </Button>
  );
}
