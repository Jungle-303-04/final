import { CircleAlert } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../shared/ui/primitives/alert";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import type { IssuesSurfaceCopy, SectionState } from "./issuesSurfaceContract";

export function IssueSectionFrame<T>({
  children,
  copy,
  state,
  unavailable,
}: {
  children: (data: T) => React.ReactNode;
  copy: IssuesSurfaceCopy;
  state: SectionState<T>;
  unavailable: string;
}) {
  if (state.data === null && state.loading) {
    return (
      <div className="grid min-h-20 gap-2" role="status">
        <span className="sr-only">{copy.sectionLoading}</span>
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );
  }
  if (state.data === null && state.failure !== null) {
    return (
      <IssueFailure
        detail={copy.failureDetail(state.failure.code)}
        title={unavailable}
      />
    );
  }
  if (state.data === null) return <IssueEmpty text={copy.sectionEmpty} />;
  return (
    <>
      {state.failure ? (
        <IssueFailure
          detail={copy.failureDetail(state.failure.code)}
          title={unavailable}
        />
      ) : null}
      {children(state.data)}
    </>
  );
}

export function IssueEmpty({ text }: { text: string }) {
  return <p className="min-h-10 py-2 text-sm text-muted-foreground">{text}</p>;
}

function IssueFailure({ detail, title }: { detail: string; title: string }) {
  return (
    <Alert className="text-[#F74720] *:data-[slot=alert-description]:text-[#F74720]" variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}
