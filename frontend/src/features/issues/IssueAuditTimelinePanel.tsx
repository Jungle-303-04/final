import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../shared/ui/primitives/accordion";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import type { IssueAuditTimelinePage } from "./issuesContract";
import { IssueEmpty, IssueSectionFrame } from "./IssueSectionFrame";
import type { IssuesSurfaceCopy, SectionState } from "./issuesSurfaceContract";

export function IssueAuditTimelinePanel({
  copy,
  onLoadMore,
  state,
}: {
  copy: IssuesSurfaceCopy;
  onLoadMore: () => void;
  state: SectionState<IssueAuditTimelinePage>;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{copy.auditLabel}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <IssueSectionFrame copy={copy} state={state} unavailable={copy.auditUnavailable}>
          {(page) => page.items.length === 0 ? (
            <IssueEmpty text={copy.sectionEmpty} />
          ) : (
            <div className="grid gap-3">
              <ol className="grid gap-3">
                {page.items.map((event, index) => {
                  const payload = Object.entries(event.payloadSummary);
                  return (
                    <li
                      className="grid gap-2 rounded-lg border p-3"
                      key={`${event.createdAt}:${event.source}:${event.subject}:${index}`}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="break-words font-medium" data-testid="audit-event-subject">
                          {event.subject}
                        </p>
                        <Badge variant="outline">{event.source}</Badge>
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <time>{copy.auditTime(event.createdAt)}</time>
                        <span className="break-all">
                          {event.causationId === null
                            ? copy.auditRoot
                            : copy.auditCause(event.causationId)}
                        </span>
                      </div>
                      {payload.length > 0 ? (
                        <Accordion>
                          <AccordionItem value={`payload-${index}`}>
                            <AccordionTrigger>{copy.auditPayload}</AccordionTrigger>
                            <AccordionContent>
                              <dl className="grid gap-2 rounded-md bg-muted/50 p-3 font-mono text-xs forced-colors:border forced-colors:border-[CanvasText]">
                                {payload.map(([key, value]) => (
                                  <div className="grid min-w-0 gap-1 sm:grid-cols-[minmax(8rem,0.35fr)_minmax(0,1fr)]" key={key}>
                                    <dt className="break-all text-muted-foreground">{key}</dt>
                                    <dd className="break-all">{displayPayloadValue(value)}</dd>
                                  </div>
                                ))}
                              </dl>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              {page.hasMore && page.nextCursor !== null ? (
                <Button disabled={state.loading} onClick={onLoadMore} type="button" variant="outline">
                  {state.loading ? copy.auditLoadingMore : copy.auditLoadMore}
                </Button>
              ) : null}
            </div>
          )}
        </IssueSectionFrame>
      </CardContent>
    </Card>
  );
}

function displayPayloadValue(value: unknown): string {
  if (typeof value === "string") return value;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}
