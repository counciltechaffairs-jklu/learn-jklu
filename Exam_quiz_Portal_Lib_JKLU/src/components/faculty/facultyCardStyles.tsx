import React from 'react';
import { Check } from 'lucide-react';

export type FacultyCardStyleId = 'constellation' | 'mesh' | 'prism' | 'halo' | 'minimal';

export interface FacultyCardStyleOption {
  id: FacultyCardStyleId;
  label: string;
  tagline: string;
  accentHex: string;
  secondaryHex: string;
  ringClass: string;
  avatarBg: string;
  badgeClass: string;
}

export const FACULTY_CARD_STYLES: FacultyCardStyleOption[] = [
  {
    id: 'constellation',
    label: 'Constellation',
    tagline: 'Orbital arcs & nodes',
    accentHex: '#896ABD',
    secondaryHex: '#E04F33',
    ringClass: 'ring-[#896ABD]/25',
    avatarBg: 'bg-gradient-to-br from-[#2B2246] to-[#5B3B96]',
    badgeClass: 'bg-[#896ABD]/12 text-[#5B3B96] border-[#896ABD]/30',
  },
  {
    id: 'mesh',
    label: 'Editorial Grid',
    tagline: 'Dot-matrix & diagonals',
    accentHex: '#3B5CCC',
    secondaryHex: '#E04F33',
    ringClass: 'ring-[#3B5CCC]/25',
    avatarBg: 'bg-gradient-to-br from-[#16224A] to-[#3B5CCC]',
    badgeClass: 'bg-[#3B5CCC]/10 text-[#28429B] border-[#3B5CCC]/28',
  },
  {
    id: 'prism',
    label: 'Soft Prism',
    tagline: 'Geometric facets',
    accentHex: '#0F766E',
    secondaryHex: '#D97706',
    ringClass: 'ring-[#0F766E]/25',
    avatarBg: 'bg-gradient-to-br from-[#0D3B38] to-[#0F766E]',
    badgeClass: 'bg-emerald-600/10 text-emerald-800 border-emerald-600/25',
  },
  {
    id: 'halo',
    label: 'Warm Halo',
    tagline: 'Concentric rings',
    accentHex: '#E04F33',
    secondaryHex: '#D97706',
    ringClass: 'ring-[#E04F33]/25',
    avatarBg: 'bg-gradient-to-br from-[#5A1D12] to-[#E04F33]',
    badgeClass: 'bg-[#E04F33]/10 text-[#B8381E] border-[#E04F33]/28',
  },
  {
    id: 'minimal',
    label: 'Classic Ink',
    tagline: 'Architectural brackets',
    accentHex: '#18181F',
    secondaryHex: '#896ABD',
    ringClass: 'ring-black/15',
    avatarBg: 'bg-[#12131A]',
    badgeClass: 'bg-black/[0.06] text-[#18181F] border-black/15',
  },
];

export const FACULTY_CARD_STYLE_MAP = new Map<FacultyCardStyleId, FacultyCardStyleOption>(
  FACULTY_CARD_STYLES.map((s) => [s.id, s])
);

export function resolveFacultyCardStyle(id?: string | null): FacultyCardStyleOption {
  const key = String(id || 'constellation').toLowerCase() as FacultyCardStyleId;
  return FACULTY_CARD_STYLE_MAP.get(key) || FACULTY_CARD_STYLES[0];
}

export const FacultyCardPatternArt: React.FC<{
  styleId: FacultyCardStyleId;
  accent: string;
  secondary: string;
  compact?: boolean;
}> = ({ styleId, accent, secondary, compact = false }) => {
  const patternId = compact ? `fac-dot-mesh-sm-${styleId}` : `fac-dot-mesh-lg-${styleId}`;
  const sizeClass = compact ? 'w-32 h-20' : 'w-80 h-44';
  const cornerFadeMask: React.CSSProperties = {
    maskImage:
      'radial-gradient(ellipse 92% 92% at 100% 0%, black 0%, rgba(0,0,0,0.72) 38%, rgba(0,0,0,0.22) 68%, transparent 100%)',
    WebkitMaskImage:
      'radial-gradient(ellipse 92% 92% at 100% 0%, black 0%, rgba(0,0,0,0.72) 38%, rgba(0,0,0,0.22) 68%, transparent 100%)',
  };

  if (styleId === 'mesh') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 320 180"
        style={cornerFadeMask}
        className={`pointer-events-none select-none absolute top-0 right-0 ${sizeClass} z-0`}
      >
        <defs>
          <pattern id={patternId} width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2.5" cy="2.5" r="1.4" fill={accent} fillOpacity="0.52" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="320" height="180" fill={`url(#${patternId})`} />
        <path
          d="M110 0 L320 155 M165 0 L320 115 M220 0 L320 75 M275 0 L320 35"
          stroke={accent}
          strokeOpacity="0.38"
          strokeWidth="1.3"
          fill="none"
        />
        <rect
          x="228"
          y="18"
          width="54"
          height="54"
          rx="10"
          stroke={secondary}
          strokeOpacity="0.4"
          strokeWidth="1.3"
          fill="none"
          transform="rotate(14 255 45)"
        />
      </svg>
    );
  }
  if (styleId === 'prism') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 320 180"
        style={cornerFadeMask}
        className={`pointer-events-none select-none absolute top-0 right-0 ${sizeClass} z-0`}
      >
        <polygon
          points="215,-6 322,22 258,108"
          fill={accent}
          fillOpacity="0.18"
          stroke={accent}
          strokeOpacity="0.48"
          strokeWidth="1.3"
        />
        <polygon
          points="146,8 228,-4 202,78"
          fill={secondary}
          fillOpacity="0.15"
          stroke={secondary}
          strokeOpacity="0.42"
          strokeWidth="1.2"
        />
        <polygon
          points="258,108 322,22 326,138"
          fill={accent}
          fillOpacity="0.12"
          stroke={accent}
          strokeOpacity="0.35"
          strokeWidth="1.1"
        />
        <polygon
          points="196,74 258,108 214,154"
          fill="none"
          stroke={secondary}
          strokeOpacity="0.34"
          strokeWidth="1.1"
        />
        <circle cx="258" cy="108" r="3.8" fill={accent} fillOpacity="0.62" />
        <circle cx="202" cy="78" r="3.2" fill={secondary} fillOpacity="0.58" />
      </svg>
    );
  }
  if (styleId === 'halo') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 320 180"
        style={cornerFadeMask}
        className={`pointer-events-none select-none absolute top-0 right-0 ${sizeClass} z-0`}
      >
        <circle cx="292" cy="24" r="142" stroke={accent} strokeOpacity="0.28" strokeWidth="1.2" fill="none" />
        <circle cx="292" cy="24" r="108" stroke={secondary} strokeOpacity="0.36" strokeWidth="1.3" strokeDasharray="5 5" fill="none" />
        <circle cx="292" cy="24" r="76" stroke={accent} strokeOpacity="0.42" strokeWidth="1.3" fill="none" />
        <circle cx="292" cy="24" r="46" stroke={secondary} strokeOpacity="0.48" strokeWidth="1.3" strokeDasharray="3 4" fill="none" />
        <circle cx="292" cy="24" r="18" fill={accent} fillOpacity="0.22" stroke={accent} strokeOpacity="0.52" strokeWidth="1.1" />
        <circle cx="216" cy="24" r="3.8" fill={secondary} fillOpacity="0.65" />
        <circle cx="248" cy="86" r="3.2" fill={accent} fillOpacity="0.6" />
      </svg>
    );
  }
  if (styleId === 'minimal') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 320 180"
        style={cornerFadeMask}
        className={`pointer-events-none select-none absolute top-0 right-0 ${sizeClass} z-0`}
      >
        <path d="M188 18 H302 V132" stroke={accent} strokeOpacity="0.42" strokeWidth="1.6" fill="none" />
        <path d="M156 34 H286 V154" stroke={secondary} strokeOpacity="0.38" strokeWidth="1.3" fill="none" />
        <path d="M224 4 H316 V96" stroke={accent} strokeOpacity="0.3" strokeWidth="1.2" fill="none" />
        <path d="M250 52 L286 18 M236 86 L286 36" stroke={accent} strokeOpacity="0.32" strokeWidth="1.1" fill="none" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 180"
      style={cornerFadeMask}
      className={`pointer-events-none select-none absolute top-0 right-0 ${sizeClass} z-0`}
    >
      <path d="M84 10 Q198 -6 314 96" stroke={accent} strokeOpacity="0.4" strokeWidth="1.3" fill="none" />
      <path d="M138 56 Q226 16 318 134" stroke={secondary} strokeOpacity="0.36" strokeWidth="1.2" strokeDasharray="4 4" fill="none" />
      <path d="M188 0 Q254 38 308 158" stroke={accent} strokeOpacity="0.32" strokeWidth="1.1" fill="none" />
      <line x1="176" y1="24" x2="236" y2="42" stroke={accent} strokeOpacity="0.46" strokeWidth="1.2" />
      <line x1="236" y1="42" x2="286" y2="26" stroke={secondary} strokeOpacity="0.46" strokeWidth="1.2" />
      <line x1="236" y1="42" x2="254" y2="96" stroke={accent} strokeOpacity="0.4" strokeWidth="1.2" />
      <line x1="286" y1="26" x2="298" y2="82" stroke={accent} strokeOpacity="0.42" strokeWidth="1.2" />
      <line x1="254" y1="96" x2="298" y2="82" stroke={secondary} strokeOpacity="0.38" strokeWidth="1.1" />
      <circle cx="176" cy="24" r="3.4" fill={accent} fillOpacity="0.62" />
      <circle cx="236" cy="42" r="4.8" fill={secondary} fillOpacity="0.65" />
      <circle cx="286" cy="26" r="4.2" fill={accent} fillOpacity="0.68" />
      <circle cx="254" cy="96" r="3.4" fill={accent} fillOpacity="0.54" />
      <circle cx="298" cy="82" r="3.8" fill={secondary} fillOpacity="0.6" />
    </svg>
  );
};

export const FacultyCardDesignPicker: React.FC<{
  selectedStyle: FacultyCardStyleId;
  onSelect: (styleId: FacultyCardStyleId) => void;
  disabled?: boolean;
  monogram?: string;
}> = ({ selectedStyle, onSelect, disabled = false, monogram = 'DR' }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {FACULTY_CARD_STYLES.map((opt) => {
        const isSelected = selectedStyle === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt.id)}
            className={`group relative overflow-hidden rounded-xl border-2 bg-white text-left transition-[border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] ${
              isSelected
                ? 'border-[#0A0A0C] ring-2 ring-[#896ABD]/30 shadow-sm'
                : 'border-[#DDD8CE] hover:border-[#896ABD]'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* Live Mini-Card Visual Sample */}
            <div className="relative h-20 w-full bg-white p-2.5 overflow-hidden border-b border-[#EFECE6]">
              <FacultyCardPatternArt
                styleId={opt.id}
                accent={opt.accentHex}
                secondary={opt.secondaryHex}
                compact
              />
              <div className="relative z-10 flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-lg ${opt.avatarBg} text-white font-mono-tabular text-[10px] font-bold flex items-center justify-center shrink-0 ring-2 ${opt.ringClass}`}
                >
                  {monogram}
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="h-2 w-14 rounded-full bg-[#0A0A0C]/75" />
                  <div className="h-1.5 w-10 rounded-full bg-[#353430]/35" />
                </div>
              </div>
              <div className="relative z-10 mt-2.5 space-y-1">
                <div className="h-1.5 w-full rounded-full bg-black/[0.08]" />
                <div className="h-1.5 w-3/4 rounded-full bg-black/[0.06]" />
              </div>

              {isSelected && (
                <span className="absolute bottom-1.5 right-1.5 z-20 w-5 h-5 rounded-full bg-[#0A0A0C] text-white flex items-center justify-center shadow">
                  <Check className="w-3 h-3" />
                </span>
              )}
            </div>

            {/* Label & Tagline */}
            <div className="px-2.5 py-2 bg-[#FAF9F6]">
              <div className="text-xs font-semibold text-[#0A0A0C] truncate">{opt.label}</div>
              <div className="text-[10px] text-[#44433E] truncate">{opt.tagline}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
