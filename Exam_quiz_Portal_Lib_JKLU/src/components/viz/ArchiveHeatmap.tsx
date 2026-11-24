import React from 'react';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { useTheme } from '@/contexts/ThemeContext';
import { CHART_COLORS, getNivoTheme, usePrefersReducedMotion } from './chartTokens';

export interface ArchiveHeatmapRow {
  id: string;
  data: Array<{ x: string; y: number }>;
}

interface ArchiveHeatmapProps {
  data: ArchiveHeatmapRow[];
  onSelectCell?: (programme: string, year: string) => void;
  ariaLabel?: string;
}

function pickHeatColor(val: number, maxVal: number, isDark: boolean): string {
  if (!val || val <= 0) {
    return isDark ? CHART_COLORS.heatmapEmptyDark : CHART_COLORS.heatmapEmptyLight;
  }
  const stops = isDark ? CHART_COLORS.heatmapStopsDark : CHART_COLORS.heatmapStopsLight;
  const ratio = Math.min(1, Math.sqrt(val / Math.max(1, maxVal)));
  const idx = Math.min(stops.length - 1, Math.floor(ratio * stops.length));
  return stops[idx];
}

const ArchiveHeatmap: React.FC<ArchiveHeatmapProps> = ({
  data,
  onSelectCell,
  ariaLabel = 'Approved papers coverage matrix by programme and year',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const reducedMotion = usePrefersReducedMotion();

  if (!data || data.length === 0) {
    return null;
  }

  const maxVal = Math.max(
    1,
    ...data.flatMap((row) => row.data.map((d) => Number(d.y || 0)))
  );

  const height = Math.max(200, Math.min(340, data.length * 42 + 64));

  return (
    <div style={{ height }} className="w-full" role="region" aria-label={ariaLabel}>
      <ResponsiveHeatMap
        data={data}
        margin={{ top: 34, right: 16, bottom: 20, left: 72 }}
        valueFormat={(v) => `${Number(v || 0)}`}
        theme={getNivoTheme(isDark)}
        animate={!reducedMotion}
        motionConfig="gentle"
        borderWidth={2}
        borderRadius={6}
        borderColor={isDark ? '#111117' : '#FFFFFF'}
        emptyColor={isDark ? CHART_COLORS.heatmapEmptyDark : CHART_COLORS.heatmapEmptyLight}
        colors={(cell) => pickHeatColor(Number(cell.value || 0), maxVal, isDark)}
        enableLabels
        label={(cell) => (Number(cell.value || 0) > 0 ? String(cell.value) : '·')}
        labelTextColor={(cell) => {
          const val = Number(cell.value || 0);
          if (val <= 0) return isDark ? '#52525E' : '#B8B4AC';
          const ratio = Math.sqrt(val / Math.max(1, maxVal));
          if (isDark) return '#F5F4F0';
          return ratio >= 0.55 ? '#FFFFFF' : '#0A0A0C';
        }}
        axisTop={{
          tickSize: 0,
          tickPadding: 10,
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 10,
        }}
        hoverTarget="cell"
        inactiveOpacity={0.45}
        onClick={(cell) => {
          if (onSelectCell) {
            onSelectCell(String(cell.serieId), String(cell.data.x));
          }
        }}
        tooltip={({ cell }) => {
          const count = Number(cell.value || 0);
          return (
            <div className="px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#14141B] text-[#0A0A0C] dark:text-[#F5F4F0] shadow-lg text-xs font-mono-tabular space-y-0.5">
              <div className="font-semibold">
                {cell.serieId} · {String(cell.data.x)}
              </div>
              <div className="text-[#5C5B57] dark:text-[#A09F9A]">
                {count > 0 ? `${count.toLocaleString()} verified papers` : 'No papers archived yet'}
              </div>
              {onSelectCell && (
                <div className="text-[10px] text-[#E04F33]">Click to open in Past Papers →</div>
              )}
            </div>
          );
        }}
        ariaLabel={ariaLabel}
      />
    </div>
  );
};

export default ArchiveHeatmap;
