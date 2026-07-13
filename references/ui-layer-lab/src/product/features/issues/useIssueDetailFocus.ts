import { useCallback, useEffect, useId, useRef, useState } from "react";

export function useIssueDetailFocus(selectedIssueId: string | null) {
  const detailRegionId = useId();
  const detailRegionRef = useRef<HTMLDivElement | null>(null);
  const pendingIssueIdRef = useRef<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  const requestDetailFocus = useCallback((issueId: string) => {
    pendingIssueIdRef.current = issueId;
    setRequestVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (selectedIssueId === null || pendingIssueIdRef.current !== selectedIssueId) return;
    pendingIssueIdRef.current = null;
    detailRegionRef.current?.focus();
  }, [requestVersion, selectedIssueId]);

  return { detailRegionId, detailRegionRef, requestDetailFocus };
}
