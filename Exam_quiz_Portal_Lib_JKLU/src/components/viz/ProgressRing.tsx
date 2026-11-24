import React from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from './chartTokens';

interface ProgressRingProps {
  value: number | null | undefined;
  max?: number;
  label: string;
  sublabel?: string;
  thresholdPct?: number;
  size?: number;
  strokeWidth?: number;
  accentColor?: string;
  belowThresholdColor?: string;
  emptyText?: string;
  displayValue?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  max = 100,
  label,
  sublabel,
  thresholdPct,
  size = 84,
  strokeWidth = 7,
  accentColor = '#10B981',
  belowThresholdColor = '#E04F33',
  emptyText = 'Not synced',
  displayValue,
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const isNull = value === null || value === undefined || !Number.isFinite(Number(value));
  const safeMax = max > 0 ? max : 100;
  const pct = isNull ? 0 : Math.max(0, Math.min(100, (Number(value) / safeMax) * 100));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference - (pct / 100) * circumference;

  const activeColor =
    !isNull && thresholdPct !== undefined && pct < thresholdPct
      ? belowThresholdColor
      : accentColor;

  // Compute optional threshold tick coordinates around circumference (starting top -90 deg)
  const thresholdCoords =
    thresholdPct !== undefined
      ? (() => {
          const angleRad = ((thresholdPct / 100) * 360 - 90) * (Math.PI / 180);
          const cx = size / 2;
          const cy = size / 2;
          return {
            x1: cx + Math.cos(angleRad) * (radius - strokeWidth * 0.75),
            y1: cy + Math.sin(angleRad) * (radius - strokeWidth * 0.75),
            x2: cx + Math.cos(angleRad) * (radius + strokeWidth * 0.75),
            y2: cy + Math.sin(angleRad) * (radius + strokeWidth * 0.75),
          };
        })()
      : null;

  return (
    <div className="flex items-center gap-3.5">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={isNull ? undefined : Number(value)}
        aria-valuetext={isNull ? emptyText : displayValue || `${Math.round(pct)}%`}
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-[#E5E2DC] dark:text-white/10"
          />

          {!isNull && (
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={activeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={
                reducedMotion
                  ? { strokeDashoffset: targetOffset }
                  : { strokeDashoffset: circumference }
              }
              animate={{ strokeDashoffset: targetOffset }}
              transition={{ duration: reducedMotion ? 0 : 0.75, ease: 'easeOut' }}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}

          {thresholdCoords && (
            <line
              x1={thresholdCoords.x1}
              y1={thresholdCoords.y1}
              x2={thresholdCoords.x2}
              y2={thresholdCoords.y2}
              stroke="currentColor"
              strokeWidth={2}
              className="text-[#0A0A0C]/70 dark:text-[#F5F4F0]/75"
            />
          )}
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          {isNull ? (
            <span className="font-mono-tabular text-[10px] text-[#5C5B57] dark:text-[#8E8D88] text-center leading-tight px-2">
              {emptyText}
            </span>
          ) : (
            <span className="font-mono-tabular text-sm font-semibold text-[#0A0A0C] dark:text-[#F5F4F0]">
              {displayValue || `${Math.round(pct)}%`}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-0.5">
        <div className="text-xs font-semibold text-[#0A0A0C] dark:text-[#F5F4F0] truncate">
          {label}
        </div>
        {sublabel && (
          <div className="text-[11px] text-[#5C5B57] dark:text-[#94938E] leading-snug">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressRing;
