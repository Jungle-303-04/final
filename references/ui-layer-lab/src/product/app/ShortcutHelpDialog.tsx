import { CircleHelp } from "lucide-react";
import { Button } from "../shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../shared/ui/primitives/dialog";
import { Kbd } from "../shared/ui/primitives/kbd";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../shared/ui/primitives/table";
import { useI18n } from "../shared/i18n";
import type { ShortcutDefinition } from "./shortcutRegistry";

interface ShortcutHelpDialogProps {
  definitions: readonly ShortcutDefinition[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutHelpDialog({
  definitions,
  open,
  onOpenChange,
}: ShortcutHelpDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={(
          <Button
            aria-keyshortcuts="?"
            aria-label={t("shell.shortcut.dialogTitle")}
            size="icon"
            variant="ghost"
          />
        )}
      >
        <CircleHelp aria-hidden="true" data-icon="inline-start" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" closeLabel={t("shell.shortcut.dialogClose")}>
        <DialogHeader>
          <DialogTitle>{t("shell.shortcut.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("shell.shortcut.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableCaption className="sr-only">{t("shell.shortcut.caption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("shell.shortcut.actionColumn")}</TableHead>
              <TableHead className="w-36 text-right" scope="col">{t("shell.shortcut.keyColumn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {definitions.map((definition) => (
              <TableRow key={definition.id}>
                <TableCell>{t(definition.labelKey, definition.labelParams)}</TableCell>
                <TableCell>
                  <span aria-hidden="true" className="flex items-center justify-end gap-1">
                    {definition.sequence.map((key, index) => (
                      <span className="contents" key={`${definition.id}:${index}`}>
                        {index > 0 && <span aria-hidden="true" className="text-muted-foreground">+</span>}
                        <Kbd>{displayShortcutKey(key)}</Kbd>
                      </span>
                    ))}
                  </span>
                  <span className="sr-only">
                    {definition.sequence.map(describeShortcutKey).join(` ${t("shell.shortcut.sequenceThen")} `)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

function displayShortcutKey(key: string): string {
  return key.startsWith("shift+") ? key.slice("shift+".length).toUpperCase() : key;
}

function describeShortcutKey(key: string): string {
  return key.startsWith("shift+")
    ? `Shift + ${key.slice("shift+".length).toUpperCase()}`
    : key;
}
