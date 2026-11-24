import React from 'react';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from './chartTokens';

export interface HistogramBarItem {
  id: string;
  label: string;
  value: number;
  sublabel?: string;
  color?: string;
}

interface MetricBarHistogramProps {
  items: HistogramBarItem[];
  onSelect?: (id: string) => void;
  thresholdIndex?: number;
  thresholdLabel?: string;
  unitLabel?: string;
  ariaLabel?: string;
}

/**
 * Clean vertical column histogram with optional vertical threshold divider (e.g. 75% attendance).
 */
export const MetricBarHistogram: React.FC<MetricBarHistogramProps> = ({
  items,
  onSelect,
  thresholdIndex,
  thresholdLabel,
  unitLabel = '',
  ariaLabel = 'Histogram chart',
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const maxVal = Math.max(1, ...items.map((item) => item.value));

  return (
    <div className="space-y-2" role="region" aria-label={ariaLabel}>
      {thresholdLabel && (
        <div className="flex items-center justify-end gap-1.5 text-[10px] font-mono-tabular text-[#E04F33]">
          <span className="inline-block w-3 h-[2px] bg-[#E04F33]" />
          <span>{thresholdLabel}</span>
        </div>
      )}

      <div className="flex items-end gap-1.5 sm:gap-2.5 h-32 pt-5 pb-1 border-b border-[#E5E2DC] dark:border-white/10">
        {items.map((item, idx) => {
          const heightPct = item.value > 0 ? Math.max(8, Math.round((item.value / maxVal) * 100)) : 3;
          const barColor = item.color || '#896ABD';

          return (
            <React.Fragment key={item.id}>
              {thresholdIndex !== undefined && idx === thresholdIndex && (
                <div
                  className="self-stretch w-[2px] border-l-2 border-dashed border-[#E04F33] shrink-0 mx-0.5"
                  aria-hidden="true"
                />
              )}

              <button
                type="button"
                disabled={!onSelect}
                onClick={() => onSelect?.(item.id)}
                title={`${item.label}: ${item.value}${unitLabel ? ` ${unitLabel}` : ''}${item.sublabel ? ` (${item.sublabel})` : ''}`}
                aria-label={`${item.label}: ${item.value}${unitLabel ? ` ${unitLabel}` : ''}`}
                className={`group flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1 ${
                  onSelect ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <span className="font-mono-tabular text-[10px] text-[#5C5B57] dark:text-[#94938E] group-hover:text-[#0A0A0C] dark:group-hover:text-white transition-colors">
                  {item.value}
                </span>
                <motion.div
                  initial={reducedMotion ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: reducedMotion ? 0 : 0.45, delay: reducedMotion ? 0 : idx * 0.04 }}
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: item.value > 0 ? barColor : 'transparent',
                    transformOrigin: 'bottom',
                  }}
                  className={`w-full rounded-t-md transition-opacity group-hover:opacity-85 ${
                    item.value === 0 ? 'border border-dashed border-[#D4D0C8] dark:border-white/15' : ''
                  }`}
                />
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex items-start gap-1.5 sm:gap-2.5 text-center">
        {items.map((item, idx) => (
          <React.Fragment key={`${item.id}-lbl`}>
            {thresholdIndex !== undefined && idx === thresholdIndex && (
              <div className="w-[2px] shrink-0 mx-0.5" aria-hidden="true" />
            )}
            <div className="flex-1 min-w-0 font-mono-tabular text-[10px] text-[#5C5B57] dark:text-[#A09F9A] truncate">
              {item.label}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default MetricBarHistogram;
