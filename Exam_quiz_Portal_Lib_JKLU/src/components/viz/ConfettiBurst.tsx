import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from './chartTokens';

interface ConfettiBurstProps {
  triggerKey: number;
}

const PIECES = Array.from({ length: 24 }, (_, idx) => {
  const angle = (idx / 24) * Math.PI * 2 + (idx % 3) * 0.14;
  const dist = 70 + (idx % 5) * 28;
  const colors = ['#E04F33', '#896ABD', '#10B981', '#0A0A0C', '#F59E0B'];
  return {
    id: idx,
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist - 30,
    rotate: (idx % 2 === 0 ? 1 : -1) * (90 + idx * 15),
    color: colors[idx % colors.length],
    shape: idx % 3, // 0 = circle, 1 = square, 2 = bar
  };
});

export const ConfettiBurst: React.FC<ConfettiBurstProps> = ({ triggerKey }) => {
  const reducedMotion = usePrefersReducedMotion();
  const [visibleKey, setVisibleKey] = useState(0);

  useEffect(() => {
    if (triggerKey <= 0 || reducedMotion) return;
    setVisibleKey(triggerKey);
    const t = setTimeout(() => setVisibleKey(0), 1500);
    return () => clearTimeout(t);
  }, [triggerKey, reducedMotion]);

  if (!visibleKey || reducedMotion) return null;

  return (
    <div
      key={visibleKey}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center overflow-hidden"
    >
      <div className="relative w-1 h-1">
        {PIECES.map((p) => (
          <motion.span
            key={p.id}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 1, rotate: 0 }}
            animate={{ x: p.dx, y: p.dy, scale: 1, opacity: 0, rotate: p.rotate }}
            transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute',
              backgroundColor: p.color,
              width: p.shape === 2 ? 10 : 7,
              height: p.shape === 2 ? 3.5 : 7,
              borderRadius: p.shape === 0 ? '9999px' : '2px',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default ConfettiBurst;
