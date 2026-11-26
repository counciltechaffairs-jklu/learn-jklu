import React from 'react';

interface PageBackdropProps {
  pathname: string;
  isDark: boolean;
}

/**
 * Illustrated graphic backdrop for all inner pages (keeping 3D WebGL AeroShards
 * exclusive to HomePage). Uses custom editorial geometric artwork that frames
 * the edges cleanly while leaving content cards crisp and easy to read.
 */
const PageBackdrop: React.FC<PageBackdropProps> = ({ pathname, isDark }) => {
  const isArchive =
    pathname.startsWith('/past-papers') || pathname.startsWith('/papers');

  const imageSrc = isArchive
    ? '/illustrations/bg-archive-graphics.jpg'
    : '/illustrations/bg-studio-graphics.jpg';

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none"
      style={{
        backgroundColor: isDark ? '#0B0B0F' : '#F8F7F4',
      }}
    >
      <img
        src={imageSrc}
        alt=""
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isDark
            ? 'invert hue-rotate-180 opacity-[0.22] saturate-150'
            : 'opacity-90'
        }`}
      />
      {/* Gentle readability veil so text cards always maintain crisp contrast */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse 75% 75% at 50% 45%, rgba(11,11,15,0.45) 0%, rgba(11,11,15,0.72) 100%)'
            : 'radial-gradient(ellipse 75% 75% at 50% 45%, rgba(248,247,244,0.35) 0%, rgba(248,247,244,0.08) 100%)',
        }}
      />
      {/* Subtle architectural margin registration frame */}
      <div className="hidden sm:block absolute inset-4 border border-[#0A0A0C]/[0.05] dark:border-white/[0.05] pointer-events-none">
        <span className="absolute -top-0.5 -left-0.5 w-3 h-3 border-t border-l border-[#0A0A0C]/20 dark:border-white/20" />
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 border-t border-r border-[#0A0A0C]/20 dark:border-white/20" />
        <span className="absolute -bottom-0.5 -left-0.5 w-3 h-3 border-b border-l border-[#0A0A0C]/20 dark:border-white/20" />
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-b border-r border-[#0A0A0C]/20 dark:border-white/20" />
      </div>
    </div>
  );
};

export default PageBackdrop;
