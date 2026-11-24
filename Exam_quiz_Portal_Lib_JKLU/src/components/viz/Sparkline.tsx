import React, { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from './chartTokens';

export interface SparklinePoint {
  label: string;
  value: number;
}

interface SparklineProps {
  data: SparklinePoint[];
  accentColor?: string;
  height?: number;
  className?: string;
  ariaLabel?: string;
  onSelectPoint?: (point: SparklinePoint) => void;
  unitLabel?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  accentColor = '#E04F33',
  height = 40,
  className = '',
  ariaLabel = 'Trend sparkline',
  onSelectPoint,
  unitLabel = '',
}) => {
  const gradId = useId().replace(/:/g, '');
  const reducedMotion = usePrefersReducedMotion();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return <div style={{ height }} className={className} aria-hidden="true" />;
  }

  const width = 160;
  const padX = 6;
  const padY = 6;
  const values = data.map((d) => Number(d.value || 0));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const coords = data.map((d, idx) => {
    const x =
      data.length === 1
        ? width / 2
        : padX + (idx / (data.length - 1)) * (width - padX * 2);
    const norm = (Number(d.value || 0) - minVal) / range;
    const y = padY + (1 - norm) * (height - padY * 2);
    return { x, y, ...d };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`;
  const activePoint = hoverIdx !== null ? coords[hoverIdx] : null;

  return (
    <div className={`relative select-none ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill={`url(#${gradId})`} />

        <motion.path
          d={linePath}
          fill="none"
          stroke={accentColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reducedMotion ? false : { pathLength: 0, opacity: 0.4 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />

        {coords.map((pt, idx) => {
          const isHovered = hoverIdx === idx;
          return (
            <g key={`${pt.label}-${idx}`}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 3.5 : 2}
                fill={isHovered ? accentColor : '#FAF9F6'}
                stroke={accentColor}
                strokeWidth={1.5}
              />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={10}
                fill="transparent"
                className={onSelectPoint ? 'cursor-pointer' : 'cursor-default'}
                tabIndex={onSelectPoint ? 0 : undefined}
                role={onSelectPoint ? 'button' : undefined}
                aria-label={`${pt.label}: ${pt.value}${unitLabel ? ` ${unitLabel}` : ''}`}
                onMouseEnter={() => setHoverIdx(idx)}
                onFocus={() => setHoverIdx(idx)}
                onBlur={() => setHoverIdx(null)}
                onClick={(e) => {
                  if (onSelectPoint) {
                    e.stopPropagation();
                    onSelectPoint({ label: pt.label, value: pt.value });
                  }
                }}
                onKeyDown={(e) => {
                  if (onSelectPoint && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectPoint({ label: pt.label, value: pt.value });
                  }
                }}
              />
            </g>
          );
        })}
      </svg>

      {activePoint && (
        <div
          className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] font-mono-tabular text-[10px] whitespace-nowrap shadow-md z-20"
        >
          {activePoint.label}: {activePoint.value.toLocaleString()}
          {unitLabel ? ` ${unitLabel}` : ''}
        </div>
      )}
    </div>
  );
};

export default Sparkline;
