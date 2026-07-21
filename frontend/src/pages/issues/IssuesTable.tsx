import type { IssueSummary } from "../../features/issues/issuesContract";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Button } from "../../shared/ui/primitives/button";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";

export function IssuesTable({
  items,
  onOpen,
  registerRowButton,
}: {
  items: readonly IssueSummary[];
  onOpen: (incidentId: string) => void;
  registerRowButton?: (
    incidentId: string,
    element: HTMLButtonElement | null,
  ) => void;
}) {
  const { t } = useI18n();

  return (
    <Table
      aria-label={t("issues.table.aria")}
      scrollAreaLabel={t("issues.table.scrollArea")}
    >
      <TableCaption className="sr-only">
        {t("issues.table.caption")}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t("issues.table.symptom")}</TableHead>
          <TableHead>{t("issues.table.status")}</TableHead>
          <TableHead>{t("issues.table.target")}</TableHead>
          <TableHead>{t("issues.table.updated")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((issue) => (
          <IssueRow
            issue={issue}
            key={issue.id}
            onOpen={onOpen}
            registerRowButton={registerRowButton}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function IssueRow({
  issue,
  onOpen,
  registerRowButton,
}: {
  issue: IssueSummary;
  onOpen: (incidentId: string) => void;
  registerRowButton?: (
    incidentId: string,
    element: HTMLButtonElement | null,
  ) => void;
}) {
  const { formatDate, t } = useI18n();
  const symptom = displayText(issue.symptom, t("issues.symptom.unavailable"));
  const incidentId = stableIncidentId(issue.incidentId);
  return (
    <TableRow>
      <TableCell className="max-w-[28rem] whitespace-normal font-medium">
        {incidentId === null ? (
          <span>{symptom}</span>
        ) : (
          <Button
            aria-label={t("issues.detail.open", { name: symptom })}
            className="h-auto max-w-full justify-start whitespace-normal px-0 text-left"
            onClick={() => onOpen(incidentId)}
            ref={(element) => registerRowButton?.(incidentId, element)}
            type="button"
            variant="link"
          >
            {symptom}
          </Button>
        )}
      </TableCell>
      <TableCell>
        <StatusMark label={displayText(issue.status, t("common.state.unknown"))} tone="unknown" />
      </TableCell>
      <TableCell className="max-w-72">
        <OverflowIdentity value={resourceLabel(issue, t("issues.target.unavailable"))} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatTimestamp(
          issue.updatedAt,
          formatDate,
          t("issues.time.unknown"),
        )}
      </TableCell>
    </TableRow>
  );
}

function stableIncidentId(value: string | null): string | null {
  return value !== null && value.trim() !== "" ? value : null;
}

function displayText(value: string | null, fallback: string): string {
  return value?.trim() || fallback;
}

function resourceLabel(issue: IssueSummary, unavailable: string): string {
  const kind = issue.resourceKind?.trim() || null;
  const name = issue.resourceName?.trim() || null;
  const namespace = issue.namespace?.trim() || null;
  const coordinate = name === null ? null : namespace ? `${namespace}/${name}` : name;
  const values = [kind, coordinate].filter((value): value is string => value !== null);
  return values.length > 0 ? values.join(" · ") : unavailable;
}

function formatTimestamp(
  value: string | null,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
  unavailable: string,
): string {
  if (!value) return unavailable;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return unavailable;
  return formatDate(parsed, {
    dateStyle: "short",
    timeStyle: "short",
  });
}
