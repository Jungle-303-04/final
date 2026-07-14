import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

interface FirstAppearanceRegistry {
  scope: string;
  seen: Set<string>;
}

const firstAppearanceContext = createContext<FirstAppearanceRegistry | null>(null);

export function FirstAppearanceMotionBoundary({
  children,
  scope,
}: {
  children: ReactNode;
  scope: string;
}) {
  return (
    <ScopedFirstAppearanceMotionBoundary key={scope} scope={scope}>
      {children}
    </ScopedFirstAppearanceMotionBoundary>
  );
}

function ScopedFirstAppearanceMotionBoundary({
  children,
  scope,
}: {
  children: ReactNode;
  scope: string;
}) {
  const [registry] = useState<FirstAppearanceRegistry>(() => ({
    scope,
    seen: new Set(),
  }));
  return (
    <firstAppearanceContext.Provider value={registry}>
      {children}
    </firstAppearanceContext.Provider>
  );
}

export function useFirstAppearanceMotion(identity: string): boolean {
  const registry = useContext(firstAppearanceContext);
  const reducedMotion = usePrefersReducedMotion();
  const entering = useMemo(
    () => registry === null || !registry.seen.has(identity),
    [identity, registry],
  );
  useLayoutEffect(() => {
    registry?.seen.add(identity);
  }, [identity, registry]);
  return !reducedMotion && entering;
}
