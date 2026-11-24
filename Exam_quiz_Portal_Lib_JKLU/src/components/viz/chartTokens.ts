import { useEffect, useState } from 'react';

export const CHART_COLORS = {
  vermilion: '#E04F33',
  lavender: '#896ABD',
  lavenderBright: '#A855F7',
  emerald: '#10B981',
  amber: '#F59E0B',
  inkLight: '#0A0A0C',
  inkDark: '#F5F4F0',
  mutedLight: '#5C5B57',
  mutedDark: '#94938E',
  borderLight: '#E5E2DC',
  borderDark: 'rgba(255,255,255,0.12)',
  heatmapEmptyLight: '#F3EFE8',
  heatmapEmptyDark: '#181820',
  heatmapStopsLight: ['#EAE4F3', '#C9B3E8', '#F29C85', '#E04F33'],
  heatmapStopsDark: ['#2D2342', '#644699', '#B24B39', '#E04F33'],
  calendarStopsLight: ['#E4D9F2', '#B797DF', '#EA7C62', '#E04F33'],
  calendarStopsDark: ['#2E2346', '#66499E', '#B44B3A', '#E04F33'],
} as const;

export function getNivoTheme(isDark: boolean) {
  const textColor = isDark ? '#A09F9A' : '#5C5B57';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,12,0.08)';
  const tooltipBg = isDark ? '#14141B' : '#FFFFFF';
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.16)' : '#E5E2DC';
  const tooltipText = isDark ? '#F5F4F0' : '#0A0A0C';

  return {
    background: 'transparent',
    text: {
      fontSize: 11,
      fill: textColor,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
    axis: {
      domain: {
        line: {
          stroke: gridColor,
          strokeWidth: 1,
        },
      },
      ticks: {
        line: {
          stroke: gridColor,
          strokeWidth: 1,
        },
        text: {
          fontSize: 11,
          fill: textColor,
        },
      },
      legend: {
        text: {
          fontSize: 11,
          fill: textColor,
        },
      },
    },
    grid: {
      line: {
        stroke: gridColor,
        strokeWidth: 1,
      },
    },
    labels: {
      text: {
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      },
    },
    tooltip: {
      container: {
        background: tooltipBg,
        color: tooltipText,
        fontSize: 12,
        borderRadius: 10,
        border: `1px solid ${tooltipBorder}`,
        boxShadow: isDark
          ? '0 10px 30px rgba(0,0,0,0.45)'
          : '0 10px 25px rgba(10,10,12,0.08)',
        padding: '8px 10px',
      },
    },
  };
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}
