import React from 'react';

interface PictogramProps {
  className?: string;
}

/**
 * Bauhaus/Swiss minimalist pictograms tailored per JKLU programme, school, and exam type.
 */
export const ProgrammePictogram: React.FC<{ programme: string } & PictogramProps> = ({
  programme,
  className = 'w-4 h-4',
}) => {
  const key = String(programme || '').toUpperCase().trim();

  if (key === 'B.TECH' || key === 'BTECH') {
    // Architectural lattice & corner node
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <rect x="3" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1.5" />
        <rect x="11" y="11" width="6" height="6" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 6H14V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
        <circle cx="6" cy="14" r="2" fill="#E04F33" />
      </svg>
    );
  }

  if (key === 'BBA') {
    // Stepped growth bars
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <rect x="3" y="11" width="3.5" height="6" stroke="currentColor" strokeWidth="1.4" />
        <rect x="8.25" y="7" width="3.5" height="10" stroke="currentColor" strokeWidth="1.4" />
        <rect x="13.5" y="3" width="3.5" height="14" fill="#E04F33" fillOpacity="0.85" />
      </svg>
    );
  }

  if (key === 'BCA') {
    // Stacked code planes
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <path d="M7 6L3.5 10L7 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 6L16.5 10L13 14" stroke="#896ABD" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="10" r="1.4" fill="#E04F33" />
      </svg>
    );
  }

  if (key === 'M.TECH' || key === 'MTECH') {
    // Concentric precision rings
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2" />
        <circle cx="10" cy="10" r="3.5" stroke="#896ABD" strokeWidth="1.6" />
        <circle cx="10" cy="10" r="1.3" fill="#E04F33" />
      </svg>
    );
  }

  if (key === 'B.DES' || key === 'BDES') {
    // Bezier arc & anchor square
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <path d="M4 15C4 8.5 8.5 4 15 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="2.5" y="13.5" width="3" height="3" fill="#896ABD" />
        <circle cx="15" cy="4" r="2.2" fill="#E04F33" />
      </svg>
    );
  }

  if (key === 'MBA') {
    // Intersecting lens & bar
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <circle cx="8" cy="10" r="4.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="12" cy="10" r="4.5" stroke="#E04F33" strokeWidth="1.4" />
      </svg>
    );
  }

  if (key === 'PHD') {
    // Compass / focal crosshair
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <path d="M10 2.5V17.5M2.5 10H17.5" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
        <polygon points="10,4.5 14.5,10 10,15.5 5.5,10" stroke="#896ABD" strokeWidth="1.5" fill="#E04F33" fillOpacity="0.2" />
      </svg>
    );
  }

  // 'ALL' or general archive grid
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="5.5" height="5.5" rx="1" fill="currentColor" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" fill="#E04F33" />
    </svg>
  );
};

export const SchoolPictogram: React.FC<{ school: string } & PictogramProps> = ({
  school,
  className = 'w-4 h-4',
}) => {
  const key = String(school || '').toUpperCase().trim();
  if (key === 'IET') {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <polygon points="10,2.5 17,6.5 17,13.5 10,17.5 3,13.5 3,6.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="10" cy="10" r="2.2" fill="#E04F33" />
      </svg>
    );
  }
  if (key === 'IM') {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <path d="M3 15H17" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 12L9 7.5L12.5 10.5L16.5 4.5" stroke="#896ABD" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16.5" cy="4.5" r="1.6" fill="#E04F33" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="8.5" cy="11.5" r="5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10.5" y="3.5" width="6" height="6" rx="1" stroke="#E04F33" strokeWidth="1.5" />
    </svg>
  );
};

export const ExamTypePictogram: React.FC<{ type: string } & PictogramProps> = ({
  type,
  className = 'w-3.5 h-3.5',
}) => {
  const key = String(type || '').toUpperCase().trim();
  if (key === 'ENDTERM') {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2.2" fill="currentColor" />
      </svg>
    );
  }
  if (key === 'MIDTERM') {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 2.5A5.5 5.5 0 0 1 8 13.5Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <polygon points="8,2 14,8 8,14 2,8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
};
