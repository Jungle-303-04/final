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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={(
          <Button
            aria-keyshortcuts="?"
            aria-label="키보드 단축키"
            size="icon"
            variant="ghost"
          />
        )}
      >
        <CircleHelp aria-hidden="true" data-icon="inline-start" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" closeLabel="단축키 도움말 닫기">
        <DialogHeader>
          <DialogTitle>키보드 단축키</DialogTitle>
          <DialogDescription>
            현재 사용할 수 있는 화면과 전역 동작만 표시합니다.
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableCaption className="sr-only">활성화된 키보드 단축키</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">동작</TableHead>
              <TableHead className="w-36 text-right" scope="col">단축키</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {definitions.map((definition) => (
              <TableRow key={definition.id}>
                <TableCell>{definition.label}</TableCell>
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
                    {definition.sequence.map(describeShortcutKey).join(" 다음 ")}
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
