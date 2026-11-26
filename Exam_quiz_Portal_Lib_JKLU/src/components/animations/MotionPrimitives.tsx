'use client';

import React, { useRef } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { cn } from '@/lib/utils';

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;
export const SPRING_SNAPPY = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 32,
  mass: 0.8,
};
export const SPRING_FLUID = {
  type: 'spring' as const,
  bounce: 0,
  duration: 0.35,
};
export const SPRING_MOMENTUM = {
  type: 'spring' as const,
  bounce: 0.16,
  duration: 0.38,
};

/**
 * Apple WWDC exponential-decay momentum projection helper.
 * Estimates how far a swipe/flick will travel given release velocity (px/s).
 */
export function projectMomentum(velocityPxPerSec: number, decelerationRate = 0.992): number {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

const RULER_TICKS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export const ScrollProgressBar: React.FC<{ className?: string }> = ({ className }) => {
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 28,
    restDelta: 0.001,
  });
  const indicatorTop = useTransform(smoothProgress, [0, 1], [0, 136]);
  const pctRef = useRef<HTMLSpanElement | null>(null);

  useMotionValueEvent(smoothProgress, 'change', (latest) => {
    if (!pctRef.current) return;
    const pct = Math.min(100, Math.max(0, Math.round(latest * 100)));
    pctRef.current.textContent = `${String(pct).padStart(2, '0')}%`;
  });

  return (
    <>
      <motion.div
        aria-hidden="true"
        style={{ scaleX: smoothProgress }}
        className={cn(
          'fixed top-0 left-0 right-0 h-[2.5px] origin-left z-50 bg-gradient-to-r from-[#E04F33] via-[#896ABD] to-[#4F46E5]',
          className
        )}
      />

      {/* Vertical Dimensional Scroll Ruler (right margin on wide screens, DOM-ref updated with zero React re-renders) */}
      <div
        aria-hidden="true"
        className="hidden 2xl:flex fixed right-3 top-1/2 -translate-y-1/2 z-40 pointer-events-none select-none flex-col items-end gap-1.5 font-mono-tabular text-[9px] text-[#5C5B57] dark:text-[#8E8D88]"
      >
        <span className="uppercase tracking-wider text-[8px] opacity-75">POS</span>
        <div className="relative w-7 h-[144px] flex justify-end py-1">
          {/* Vertical datum spine */}
          <div className="w-px h-full bg-[#0A0A0C]/20 dark:bg-white/20" />

          {/* Precision millimeter graduation ticks */}
          {RULER_TICKS.map((t) => {
            const isMajor = t === 0 || t === 50 || t === 100;
            return (
              <span
                key={t}
                style={{ top: `${Math.round((t / 100) * 136) + 4}px` }}
                className={`absolute right-0 h-px bg-[#0A0A0C]/35 dark:bg-white/30 ${
                  isMajor ? 'w-3' : 'w-1.5 opacity-60'
                }`}
              />
            );
          })}

          {/* Scroll-driven dimensional pointer + percentage readout */}
          <motion.div
            style={{ y: indicatorTop }}
            className="absolute top-1 right-0 flex items-center gap-1"
          >
            <span
              ref={pctRef}
              className="px-1 py-0.5 rounded bg-white/90 dark:bg-[#141418]/90 border border-[#0A0A0C]/25 dark:border-white/20 text-[#0A0A0C] dark:text-[#F5F4F0] font-semibold leading-none shadow-sm"
            >
              00%
            </span>
            <svg width="6" height="6" viewBox="0 0 6 6" className="text-[#E04F33] shrink-0">
              <polygon points="0,0.5 6,3 0,5.5" fill="currentColor" />
            </svg>
          </motion.div>
        </div>
        <span className="uppercase tracking-wider text-[8px] opacity-75">1:1</span>
      </div>
    </>
  );
};

interface MotionRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}

export const MotionReveal: React.FC<MotionRevealProps> = ({
  children,
  className,
  delay = 0,
  y = 12,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{
        duration: 0.26,
        ease: EASE_OUT,
        delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export const PageTransition: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.22, ease: EASE_OUT }}
    className={className}
  >
    {children}
  </motion.div>
);

export const MorphLabel: React.FC<{
  stateKey: string;
  children: React.ReactNode;
  className?: string;
}> = ({ stateKey, children, className }) => (
  <AnimatePresence mode="popLayout" initial={false}>
    <motion.span
      key={stateKey}
      initial={{ opacity: 0, y: 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.16, ease: EASE_OUT }}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      {children}
    </motion.span>
  </AnimatePresence>
);
