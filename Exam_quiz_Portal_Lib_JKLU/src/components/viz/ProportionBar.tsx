import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from './chartTokens';

export interface ProportionSegment {
  id: string;
  label: string;
  value: number;
  color: string;
  icon?: React.ReactNode;
}

interface ProportionBarProps {
  segments: ProportionSegment[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  ariaLabel?: string;
  unitLabel?: string;
  heightClass?: string;
  showLegend?: boolean;
}

export const ProportionBar: React.FC<ProportionBarProps> = ({
  segments,
  activeId = null,
  onSelect,
  ariaLabel = 'Distribution bar',
  unitLabel = '',
  heightClass = 'h-3',
  showLegend = true,
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nonZero = segments.filter((s) => s.value > 0);
  const total = nonZero.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return null;
  }

  return (
    <div className="space-y-2.5" aria-label={ariaLabel}>
      {/* Segmented Animated Horizontal Bar */}
      <div
        className={`w-full ${heightClass} rounded-full overflow-hidden flex gap-0.5 bg-[#FAF9F6] dark:bg-white/[0.06] p-0.5 border border-[#E5E2DC]/80 dark:border-white/10`}
      >
        {nonZero.map((seg) => {
          const pct = (seg.value / total) * 100;
          const isSelected = activeId !== null && activeId !== 'ALL' && activeId === seg.id;
          const isDimmed =
            (activeId !== null && activeId !== 'ALL' && activeId !== seg.id) ||
            (hoveredId !== null && hoveredId !== seg.id);

          return (
            <motion.button
              key={seg.id}
              type="button"
              onClick={() => onSelect?.(seg.id)}
              onMouseEnter={() => setHoveredId(seg.id)}
              onMouseLeave={() => setHoveredId(null)}
              disabled={!onSelect}
              title={`${seg.label}: ${seg.value.toLocaleString()}${unitLabel ? ` ${unitLabel}` : ''} (${pct.toFixed(1)}%)`}
              aria-label={`Filter by ${seg.label}: ${seg.value}${unitLabel ? ` ${unitLabel}` : ''}`}
              initial={reducedMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: 1, opacity: isDimmed ? 0.38 : 1 }}
              transition={{ duration: reducedMotion ? 0 : 0.45, ease: 'easeOut' }}
              style={{
                width: `${Math.max(pct, 2.5)}%`,
                backgroundColor: seg.color,
                transformOrigin: 'left',
              }}
              className={`h-full rounded-full transition-opacity ${
                onSelect ? 'cursor-pointer' : 'cursor-default'
              } ${isSelected ? 'ring-2 ring-[#0A0A0C] dark:ring-[#F5F4F0]' : ''}`}
            />
          );
        })}
      </div>

      {/* Clickable Interactive Legend Pills */}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-2">
          {segments.map((seg) => {
            const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
            const isSelected = activeId !== null && activeId !== 'ALL' && activeId === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                disabled={!onSelect}
                onClick={() => onSelect?.(seg.id)}
                onMouseEnter={() => setHoveredId(seg.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono-tabular border transition-[border-color] ${
                  isSelected
                    ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] border-transparent font-semibold'
                    : 'bg-[#FAF9F6]/80 dark:bg-white/[0.03] border-[#E5E2DC] dark:border-white/15 text-[#5C5B57] dark:text-[#C4C3BE] hover:border-[#0A0A0C] dark:hover:border-white/40'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                {seg.icon}
                <span>{seg.label}</span>
                <span className="opacity-75">
                  {seg.value.toLocaleString()} ({pct}%)
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProportionBar;
