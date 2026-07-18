import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../shared/ui/primitives/accordion";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
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
    <section className="grid min-w-0 gap-4" aria-label={copy.auditLabel}>
      <h3 className="text-sm font-semibold">{copy.auditLabel}</h3>
      <div className="grid gap-3">
        <IssueSectionFrame copy={copy} state={state} unavailable={copy.auditUnavailable}>
          {(page) => page.items.length === 0 ? (
            <IssueEmpty text={copy.sectionEmpty} />
          ) : (
            <div className="grid gap-3">
              <ol className="divide-y">
                {page.items.map((event, index) => {
                  const payload = Object.entries(event.payloadSummary);
                  return (
                    <li
                      className="relative grid min-w-0 gap-2 overflow-hidden py-4 pl-5 first:pt-0 last:pb-0 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:bg-primary/60 first:before:top-0 last:before:bottom-0"
                      key={event.eventId}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p
                          className="min-w-0 flex-1 truncate font-medium"
                          data-testid="audit-event-subject"
                          title={event.subject}
                        >
                          {copy.auditEvent(event.subject)}
                        </p>
                        <Badge title={event.source} variant="outline">
                          {copy.auditStage(event.journeyStage)}
                        </Badge>
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
      </div>
    </section>
  );
}

function displayPayloadValue(value: unknown): string {
  if (typeof value === "string") return value;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}
