import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { OperationReobserveButton } from "./OperationReobserveButton";
import {
  useOperationStatusSnapshots,
} from "./OperationStatusStore";
import {
  canReobserveOperation,
  operationStatusKeys,
  operationStatusTone,
} from "./operationPresentation";

export function OperationStatusCenter() {
  const { t } = useI18n();
  const snapshots = useOperationStatusSnapshots();
  if (snapshots.length === 0) return null;

  return (
    <section
      aria-label={t("shell.dock.operationCenter")}
      className="grid min-h-0 gap-2 overflow-y-auto p-3"
      data-slot="operation-status-center"
    >
      <h2 className="text-sm font-medium">{t("shell.dock.operationCenter")}</h2>
      <ul className="grid gap-2">
        {snapshots.map((snapshot) => {
          const statusLabel = t(operationStatusKeys[snapshot.status]);
          return (
            <li
              className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2"
              key={snapshot.commandId}
            >
              <StatusMark label={statusLabel} tone={operationStatusTone(snapshot.status)} />
              <code className="min-w-0 flex-1 truncate text-xs">{snapshot.commandId}</code>
              <OperationReobserveButton
                commandId={snapshot.commandId}
                enabled={canReobserveOperation(snapshot.status)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
