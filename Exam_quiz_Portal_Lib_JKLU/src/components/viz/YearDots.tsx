import React from 'react';

const DEFAULT_YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];

interface YearDotsProps {
  availableYears?: number[];
  allYears?: number[];
  highlightYear?: number | string;
  onSelectYear?: (year: number) => void;
  className?: string;
}

/**
 * Compact pictographical 2020-2026 coverage indicator showing which sessions exist for a course.
 */
export const YearDots: React.FC<YearDotsProps> = ({
  availableYears = [],
  allYears = DEFAULT_YEARS,
  highlightYear,
  onSelectYear,
  className = '',
}) => {
  const yearSet = new Set(availableYears.map(Number));

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      title={
        availableYears.length > 0
          ? `Available sessions: ${availableYears.join(', ')}`
          : 'No multi-year coverage metadata'
      }
      aria-label={`Session years: ${availableYears.join(', ') || 'none'}`}
    >
      {allYears.map((yr) => {
        const has = yearSet.has(yr);
        const isCurrent = highlightYear !== undefined && Number(highlightYear) === yr;

        if (onSelectYear && has) {
          return (
            <button
              key={yr}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectYear(yr);
              }}
              title={`Filter ${yr} papers`}
              className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono-tabular transition-colors ${
                isCurrent
                  ? 'bg-[#E04F33] text-white font-semibold'
                  : 'bg-[#896ABD]/15 text-[#6D4AFF] dark:text-[#C4B5FD] hover:bg-[#E04F33] hover:text-white'
              }`}
            >
              {String(yr).slice(-2)}
            </button>
          );
        }

        return (
          <span
            key={yr}
            title={`${yr}: ${has ? 'Available' : 'No papers'}`}
            className={`inline-block rounded-full transition-colors ${
              isCurrent
                ? 'w-2.5 h-2.5 bg-[#E04F33] ring-2 ring-[#E04F33]/30'
                : has
                  ? 'w-2 h-2 bg-[#896ABD] dark:bg-[#A855F7]'
                  : 'w-1.5 h-1.5 border border-[#D4D0C8] dark:border-white/20 bg-transparent'
            }`}
          />
        );
      })}
    </div>
  );
};

export default YearDots;
