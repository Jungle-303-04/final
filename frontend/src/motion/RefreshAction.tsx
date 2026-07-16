import { RefreshAction as SemanticRefreshAction } from "../shared/ui/RefreshFeedback";
import type { RefreshActionProps, RefreshFeedbackState } from "../shared/ui/RefreshFeedback";
import { RefreshFeedbackGlyph } from "./RefreshFeedbackGlyph";

export type MotionRefreshActionProps = Omit<RefreshActionProps, "renderFeedback">;

/** Binds the Motion-only glyph to the reusable semantic refresh action. */
export function RefreshAction(props: MotionRefreshActionProps) {
  return <SemanticRefreshAction {...props} renderFeedback={renderRefreshFeedbackGlyph} />;
}

function renderRefreshFeedbackGlyph(state: RefreshFeedbackState) {
  return <RefreshFeedbackGlyph state={state} />;
}
