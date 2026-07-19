import type { IssuesSurfaceCopy } from "./issuesSurfaceContract";
import {
  useIssuesSurfaceController,
  type IssuesSurfaceControllerOptions,
} from "./useIssuesSurfaceController";
import { IssuesSurfaceView } from "./IssuesSurfaceView";

export function IssuesSurface({
  copy,
  ...options
}: IssuesSurfaceControllerOptions & { copy: IssuesSurfaceCopy }) {
  const controller = useIssuesSurfaceController(options);
  return (
    <IssuesSurfaceView
      {...controller}
      copy={copy}
      recoverySelection={options.recoverySelection}
    />
  );
}
