import React from 'react';
import { ResponsiveCalendar } from '@nivo/calendar';
import { useTheme } from '@/contexts/ThemeContext';
import { CHART_COLORS, getNivoTheme } from './chartTokens';

export interface ActivityDay {
  day: string;
  value: number;
  uploads?: number;
  submissions?: number;
  announcements?: number;
  classwork?: number;
  grades?: number;
}

interface ActivityCalendarProps {
  from: string;
  to: string;
  data: ActivityDay[];
  ariaLabel?: string;
}

const ActivityCalendar: React.FC<ActivityCalendarProps> = ({
  from,
  to,
  data,
  ariaLabel = 'Academic activity heatmap over the last 365 days',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const dayDetailsMap = new Map(data.map((d) => [d.day, d]));
  const colors = isDark
    ? [...CHART_COLORS.calendarStopsDark]
    : [...CHART_COLORS.calendarStopsLight];

  return (
    <div className="w-full overflow-x-auto pb-1" role="region" aria-label={ariaLabel}>
      <div className="min-w-[620px] h-[160px]">
        <ResponsiveCalendar
          data={data}
          from={from}
          to={to}
          emptyColor={isDark ? '#1A1A22' : '#EFECE6'}
          colors={colors}
          margin={{ top: 20, right: 16, bottom: 10, left: 26 }}
          yearSpacing={30}
          monthSpacing={6}
          monthBorderColor="transparent"
          daySpacing={2}
          dayBorderWidth={1}
          dayBorderColor={isDark ? '#111117' : '#FAF9F6'}
          theme={getNivoTheme(isDark)}
          tooltip={({ day, value }) => {
            const detail = dayDetailsMap.get(day);
            const parts: string[] = [];
            if (detail?.uploads) parts.push(`${detail.uploads} paper upload${detail.uploads > 1 ? 's' : ''}`);
            if (detail?.submissions) parts.push(`${detail.submissions} submission${detail.submissions > 1 ? 's' : ''}`);
            if (detail?.announcements) parts.push(`${detail.announcements} announcement${detail.announcements > 1 ? 's' : ''}`);
            if (detail?.classwork) parts.push(`${detail.classwork} classwork`);
            if (detail?.grades) parts.push(`${detail.grades} graded`);

            return (
              <div className="px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#14141B] text-[#0A0A0C] dark:text-[#F5F4F0] shadow-lg text-xs font-mono-tabular space-y-0.5">
                <div className="font-semibold">{day}</div>
                <div className="text-[#5C5B57] dark:text-[#A09F9A]">
                  {Number(value || 0)} total action{Number(value || 0) === 1 ? '' : 's'}
                </div>
                {parts.length > 0 && (
                  <div className="text-[10px] text-[#E04F33]">{parts.join(' · ')}</div>
                )}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
};

export default ActivityCalendar;
