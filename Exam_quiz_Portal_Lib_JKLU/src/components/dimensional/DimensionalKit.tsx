import React from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT } from '@/components/animations/MotionPrimitives';
import { usePrefersReducedMotion } from '@/components/viz/chartTokens';

export interface SpecCell {
  label: string;
  value: string;
}

interface DimensionalTitleBlockProps {
  dwgNo: string;
  rev?: string;
  scope: string;
  cells?: SpecCell[];
  className?: string;
}

/**
 * Monochrome Apple-style technical drawing header strip modeled on
 * enesozturk/dimensional-drawing title-block geometry.
 */
export const DimensionalTitleBlock: React.FC<DimensionalTitleBlockProps> = ({
  dwgNo,
  rev = '2.0',
  scope,
  cells = [],
  className = '',
}) => {
  const allCells: SpecCell[] = [
    { label: 'DWG NO.', value: dwgNo },
    { label: 'REV', value: rev },
    { label: 'SCOPE', value: scope },
    ...cells,
  ];

  return (
    <div
      className={`dw-titleblock rounded-lg overflow-hidden text-[10px] font-mono-tabular uppercase tracking-wider text-[#0A0A0C] dark:text-[#F5F4F0] ${className}`}
    >
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap divide-x divide-y sm:divide-y-0 divide-[#0A0A0C]/15 dark:divide-white/15">
        {allCells.map((cell) => (
          <div
            key={`${cell.label}-${cell.value}`}
            className="px-2.5 py-1.5 flex items-center gap-1.5 min-w-0"
          >
            <span className="text-[9px] text-[#5C5B57] dark:text-[#8E8D88] shrink-0">
              {cell.label}
            </span>
            <span className="font-semibold truncate">{cell.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface DimensionalSpecDividerProps {
  code: string;
  label: string;
  metric?: string;
  className?: string;
}

/**
 * Scroll-drawn horizontal dimension chain divider with SVG extension ticks,
 * arrowheads, and center monospaced callout.
 */
export const DimensionalSpecDivider: React.FC<DimensionalSpecDividerProps> = ({
  code,
  label,
  metric,
  className = '',
}) => {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-2.5 text-[10px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E] select-none ${className}`}
    >
      {/* Left tick + arrow + centerline (draws outward from center badge on scroll) */}
      <motion.div
        initial={reducedMotion ? undefined : { scaleX: 0.001, opacity: 0.25 }}
        whileInView={reducedMotion ? undefined : { scaleX: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.46, ease: EASE_OUT }}
        className="flex items-center gap-1.5 flex-1 min-w-[28px] origin-right"
      >
        <svg
          width="14"
          height="10"
          viewBox="0 0 14 10"
          className="shrink-0 text-[#0A0A0C]/55 dark:text-white/45"
        >
          <line x1="0.5" y1="1" x2="0.5" y2="9" stroke="currentColor" strokeWidth="1" />
          <polygon points="1,5 6.5,2.5 6.5,7.5" fill="currentColor" />
          <line x1="6" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="0.9" />
        </svg>
        <div className="dw-centerline flex-1" />
      </motion.div>

      {/* Center boxed index + section identifier */}
      <motion.div
        initial={reducedMotion ? undefined : { opacity: 0, y: 4 }}
        whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
        className="inline-flex items-center gap-2 px-2 py-0.5 rounded border border-[#0A0A0C]/15 dark:border-white/15 bg-white/85 dark:bg-[#111117]/85 shrink-0 max-w-full"
      >
        <span className="font-bold text-[#0A0A0C] dark:text-[#F5F4F0]">{code}</span>
        <span className="text-[#0A0A0C]/30 dark:text-white/25">|</span>
        <span className="truncate">{label}</span>
        {metric && (
          <>
            <span className="hidden sm:inline text-[#0A0A0C]/30 dark:text-white/25">·</span>
            <span className="hidden sm:inline text-[#0A0A0C]/70 dark:text-white/70">{metric}</span>
          </>
        )}
      </motion.div>

      {/* Right centerline + arrow + tick */}
      <motion.div
        initial={reducedMotion ? undefined : { scaleX: 0.001, opacity: 0.25 }}
        whileInView={reducedMotion ? undefined : { scaleX: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.46, ease: EASE_OUT }}
        className="flex items-center gap-1.5 flex-1 min-w-[28px] origin-left"
      >
        <div className="dw-centerline flex-1" />
        <svg
          width="14"
          height="10"
          viewBox="0 0 14 10"
          className="shrink-0 text-[#0A0A0C]/55 dark:text-white/45"
        >
          <line x1="0" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="0.9" />
          <polygon points="13,5 7.5,2.5 7.5,7.5" fill="currentColor" />
          <line x1="13.5" y1="1" x2="13.5" y2="9" stroke="currentColor" strokeWidth="1" />
        </svg>
      </motion.div>
    </div>
  );
};

interface DimensionalCornerMarksProps {
  insetClass?: string;
}

/**
 * 4-corner hairline registration ticks for auth cards and focal panels.
 */
export const DimensionalCornerMarks: React.FC<DimensionalCornerMarksProps> = ({
  insetClass = 'inset-2.5',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute ${insetClass} z-10 select-none`}
    >
      <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#0A0A0C]/35 dark:border-white/30" />
      <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[#0A0A0C]/35 dark:border-white/30" />
      <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[#0A0A0C]/35 dark:border-white/30" />
      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[#0A0A0C]/35 dark:border-white/30" />
    </div>
  );
};

interface DimensionalDraftCardProps {
  specCode: string;
  specLabel: string;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * Motion-first dimensional card shell:
 * - On scroll-into-view: an inline SVG perimeter traces itself (`pathLength: 0 -> 1`)
 *   like a pen drafting the card before settling cleanly.
 * - On hover (desktop pointer-fine): lifts slightly over a shifted 45-degree
 *   hatched drafting footprint (`dw-hatch`) and reveals a top dimension callout.
 */
export const DimensionalDraftCard: React.FC<DimensionalDraftCardProps> = ({
  specCode,
  specLabel,
  delay = 0,
  className = '',
  children,
}) => {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <motion.div
      initial={reducedMotion ? undefined : { opacity: 0, y: 14 }}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.14 }}
      transition={{ duration: 0.34, ease: EASE_OUT, delay }}
      className={`group/draft relative h-full ${className}`}
    >
      {/* Offset 45deg monochrome hatched footprint beneath card */}
      <div
        aria-hidden="true"
        className="dw-draft-shadow dw-hatch pointer-events-none absolute inset-0 rounded-2xl border border-[#0A0A0C]/20 dark:border-white/15 -z-10"
      />

      {/* Top hover dimension callout badge */}
      <div
        aria-hidden="true"
        className="dw-draft-callout pointer-events-none absolute -top-3 right-3 z-30 inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#0A0A0C]/25 dark:border-white/20 bg-white/95 dark:bg-[#141418]/95 text-[#0A0A0C] dark:text-[#F5F4F0] font-mono-tabular text-[9px] uppercase tracking-wider shadow-sm"
      >
        <span>←</span>
        <span className="font-bold">{specCode}</span>
        <span className="text-[#0A0A0C]/30 dark:text-white/25">·</span>
        <span>{specLabel}</span>
        <span>→</span>
      </div>

      {/* Main content container */}
      <div className="dw-draft-lift relative h-full">
        {/* Pen-drawn SVG perimeter overlay on scroll entry */}
        {!reducedMotion && (
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 w-full h-full z-20 rounded-2xl"
          >
            <motion.rect
              x="0.5"
              y="0.5"
              width="99"
              height="99"
              rx="4"
              fill="none"
              stroke="rgba(10,10,12,0.42)"
              strokeWidth="0.65"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0, opacity: 0.9 }}
              whileInView={{ pathLength: 1, opacity: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{
                pathLength: { duration: 0.55, ease: EASE_OUT, delay },
                opacity: { duration: 0.28, ease: EASE_OUT, delay: delay + 0.42 },
              }}
            />
          </svg>
        )}

        {/* Animated top drafting hairline rule on hover */}
        <div
          aria-hidden="true"
          className="dw-draft-hover-bar pointer-events-none absolute top-0 left-4 right-4 h-[1.5px] z-30 bg-[#0A0A0C]/45 dark:bg-white/40"
        />

        {children}
      </div>
    </motion.div>
  );
};
