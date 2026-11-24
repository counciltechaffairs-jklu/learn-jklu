import React, { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { usePrefersReducedMotion } from './chartTokens';

interface CountUpProps {
  value: number;
  durationMs?: number;
  formatter?: (val: number) => string;
  className?: string;
}

export const CountUp: React.FC<CountUpProps> = ({
  value,
  durationMs = 700,
  formatter = (v) => Math.round(v).toLocaleString(),
  className = '',
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const reducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = useState<number>(value);
  const prevRef = useRef<number>(0);

  useEffect(() => {
    if (!inView) return;
    if (reducedMotion || durationMs <= 0) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }

    const startVal = prevRef.current;
    const delta = value - startVal;
    if (delta === 0) {
      setDisplay(value);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = startVal + delta * eased;
      setDisplay(current);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
        prevRef.current = value;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, inView, reducedMotion, durationMs]);

  return (
    <span ref={ref} className={`font-mono-tabular ${className}`}>
      {formatter(display)}
    </span>
  );
};

export default CountUp;
