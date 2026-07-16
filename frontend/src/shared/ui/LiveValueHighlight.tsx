import { useEffect, useRef, useState, type ReactNode } from "react";

export type LiveValueTone = "healthy" | "warning" | "info";

export function LiveValueHighlight({
  children,
  tone,
  value,
}: {
  children: ReactNode;
  tone: LiveValueTone;
  value: string | number | null | undefined;
}) {
  const previous = useRef(value);
  const initialized = useRef(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      previous.current = value;
      return;
    }
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    setRevision((current) => current + 1);
  }, [value]);

  return (
    <span
      className={revision > 0 ? "motion-value-change" : "motion-value-static"}
      data-tone={tone}
      key={revision}
    >
      {children}
    </span>
  );
}
