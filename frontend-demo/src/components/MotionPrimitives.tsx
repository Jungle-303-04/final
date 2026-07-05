import { motion, type HTMLMotionProps } from 'motion/react';
import { cardHover, cardTap, quickSpring } from '../motion/presets';

export function MotionButton({ children, ...props }: HTMLMotionProps<'button'>) {
  return (
    <motion.button
      type="button"
      whileHover={cardHover}
      whileTap={cardTap}
      transition={quickSpring}
      {...props}
    >
      {children}
    </motion.button>
  );
}
