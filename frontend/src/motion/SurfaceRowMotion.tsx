import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  type HTMLMotionProps,
} from "motion/react";
import * as m from "motion/react-m";
import type { JSX, ReactNode } from "react";

import { MOTION_SPRING, MOTION_TWEEN, listStaggerDelay } from "./transitions";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type DivRowProps = HTMLMotionProps<"div"> & { as?: "div"; index: number };
type TableRowProps = HTMLMotionProps<"tr"> & { as: "tr"; index: number };

export function SurfaceRowMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}

export function SurfaceRowPresence({ children }: { children: ReactNode }) {
  return <AnimatePresence>{children}</AnimatePresence>;
}

export function SurfaceRowMotion(props: DivRowProps): JSX.Element;
export function SurfaceRowMotion(props: TableRowProps): JSX.Element;
export function SurfaceRowMotion({ as = "div", index, ...props }: DivRowProps | TableRowProps) {
  const reducedMotion = usePrefersReducedMotion();
  const motionProps = {
    animate: { opacity: 1, y: 0 },
    exit: reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 },
    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 5 },
    transition: reducedMotion
      ? MOTION_TWEEN.none
      : { ...MOTION_SPRING.soft, delay: listStaggerDelay(index) },
  } as const;

  if (as === "tr") {
    return <m.tr {...(props as HTMLMotionProps<"tr">)} {...motionProps} />;
  }
  return <m.div {...(props as HTMLMotionProps<"div">)} {...motionProps} />;
}
