import type {
  HelmRenderedResourceChange,
  HelmRenderedResourceRef,
  HelmValuesPreviewResources,
} from "../../features/helm/helmContract";
import { useHelmCopy, type HelmCopy } from "../../features/helm/helmCopy";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";

export function HelmResourcesDiffView({
  diff,
}: {
  diff: HelmValuesPreviewResources;
}) {
  const copy = useHelmCopy();
  return (
    <div className="grid min-w-0 gap-3">
      <StructuredParseNotice
        count={diff.parseErrorCount}
        singular={copy.resourceParseError}
        plural={copy.resourceParseErrors}
      />
      <ResourceRefSection copy={copy} heading={copy.resourcesAdded} items={diff.added} />
      <ResourceRefSection copy={copy} heading={copy.resourcesRemoved} items={diff.removed} />
      {diff.modified.length > 0 ? (
        <section className="grid min-w-0 gap-2">
          <h3 className="text-sm font-semibold">{copy.resourcesModified}</h3>
          <ul className="min-w-0 divide-y border-y">
            {diff.modified.map((resource) => (
              <HelmResourceChangeCard
                copy={copy}
                key={`${resource.apiVersion}:${resource.kind}:${resource.namespace}:${resource.name}`}
                resource={resource}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {diff.added.length + diff.removed.length + diff.modified.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.artifactEmpty}</p>
      ) : null}
      {diff.unchanged.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {copy.resourcesUnchanged}: {diff.unchanged.length}
        </p>
      ) : null}
    </div>
  );
}

export function StructuredParseNotice({
  count,
  plural,
  singular,
}: {
  count: number;
  plural: string;
  singular: string;
}) {
  if (count === 0) return null;
  return (
    <p
      className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground"
      role="status"
    >
      {count} {count === 1 ? singular : plural}
    </p>
  );
}

function ResourceRefSection({
  copy,
  heading,
  items,
}: {
  copy: HelmCopy;
  heading: string;
  items: readonly HelmRenderedResourceRef[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="grid min-w-0 gap-2">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <ul className="min-w-0 divide-y border-y text-xs">
        {items.map((item) => (
          <li
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
            key={`${item.apiVersion}:${item.kind}:${item.namespace}:${item.name}`}
          >
            <span className="font-mono font-medium">{item.kind}/{item.name}</span>
            <span className="text-muted-foreground">
              {item.namespace || copy.unavailableValue}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HelmResourceChangeCard({
  copy,
  resource,
}: {
  copy: HelmCopy;
  resource: HelmRenderedResourceChange;
}) {
  return (
    <li className="grid min-w-0 gap-2 py-3 text-xs">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="font-mono font-medium">{resource.kind}/{resource.name}</span>
        <span className="text-muted-foreground">{resource.summary}</span>
      </div>
      {resource.fields.length > 0 ? (
        <Table scrollAreaLabel={`${resource.kind}/${resource.name} ${copy.changedFields}`}>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.changedFields}</TableHead>
              <TableHead>{copy.previousValue}</TableHead>
              <TableHead>{copy.currentValue}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resource.fields.map((field) => (
              <TableRow key={field.path}>
                <TableCell><code className="break-all">{field.path}</code></TableCell>
                <TableCell className="break-all">{formatStructuredValue(field.oldValue, copy.unavailableValue)}</TableCell>
                <TableCell className="break-all">{formatStructuredValue(field.newValue, copy.unavailableValue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground">
          {copy.changedFields}: {resource.fieldCount}
        </p>
      )}
    </li>
  );
}

function formatStructuredValue(
  value: string | number | boolean | null,
  unavailableValue: string,
): string {
  if (value === null) return unavailableValue;
  return typeof value === "string" ? value : String(value);
}
