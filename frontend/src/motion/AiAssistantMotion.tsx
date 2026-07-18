import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  type HTMLMotionProps,
} from "motion/react";
import * as m from "motion/react-m";
import type { ReactNode } from "react";

import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const reducedTransition = { duration: 0 } as const;
const turnTransition = {
  damping: 30,
  stiffness: 360,
  type: "spring",
} as const;

export function AiAssistantMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}

export function AiAssistantTurnPresence({ children }: { children: ReactNode }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {children}
    </AnimatePresence>
  );
}

export function AiAssistantTurnMotion({
  children,
  ...props
}: HTMLMotionProps<"article">) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <m.article
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      layout={!reducedMotion}
      transition={reducedMotion ? reducedTransition : turnTransition}
      {...props}
    >
      {children}
    </m.article>
  );
}

export function AiAssistantSuggestionMotion({
  children,
  index,
}: {
  children: ReactNode;
  index: number;
}) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <m.div
      animate={{ opacity: 1, y: 0 }}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
      transition={reducedMotion
        ? reducedTransition
        : { delay: index * 0.035, duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </m.div>
  );
}
