import React, { useEffect, useState } from 'react';
import { Grid } from 'lucide-react';
import techAffairsLogo from '@/assets/technical-affairs-logo.png';
import JKLULogo from '@/components/layout/JKLULogo';

const SPEC_GRID_KEY = 'jklu_spec_grid';

const Footer: React.FC = () => {
  const [specGrid, setSpecGrid] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SPEC_GRID_KEY) === 'true';
      setSpecGrid(saved);
      if (saved) {
        document.documentElement.dataset.specGrid = 'true';
      } else {
        delete document.documentElement.dataset.specGrid;
      }
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  const toggleSpecGrid = () => {
    const next = !specGrid;
    setSpecGrid(next);
    try {
      sessionStorage.setItem(SPEC_GRID_KEY, next ? 'true' : 'false');
    } catch {
      // Ignore storage errors
    }
    if (next) {
      document.documentElement.dataset.specGrid = 'true';
    } else {
      delete document.documentElement.dataset.specGrid;
    }
  };

  return (
    <footer className="relative z-40 bg-[#FAF9F6] dark:bg-[#0A0A0C] border-t border-[#E5E2DC] dark:border-[#232329] text-[#0A0A0C] dark:text-[#F5F4F0] mt-auto transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-6">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-8">
          {/* Left Section - Official Logos (JKLU & Council of Technical Affairs) */}
          <div className="flex items-center gap-4 sm:gap-5">
            <JKLULogo size="md" className="opacity-95 hover:opacity-100 transition-opacity" />
            <div className="h-9 w-[1px] bg-[#E5E2DC] dark:bg-[#232329]" />
            <img
              src={(techAffairsLogo as any)?.src || techAffairsLogo}
              alt="Council of Technical Affairs Logo"
              className="h-11 sm:h-12 w-11 sm:w-12 rounded-lg object-cover border border-[#E5E2DC] dark:border-[#232329] shadow-sm"
            />
          </div>

          {/* Center Section - Council of Technical Affairs Leadership */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E04F33]" />
              <h3 className="text-xs sm:text-sm font-mono-tabular uppercase tracking-wider font-semibold text-[#0A0A0C] dark:text-[#F5F4F0]">
                Council of Technical Affairs · JKLU
              </h3>
            </div>
            <div className="text-xs sm:text-sm space-y-1">
              <p className="text-[#5C5B57] dark:text-[#94938E]">
                <span className="text-[#0A0A0C] dark:text-[#F5F4F0] font-semibold">
                  Aman Pratap Singh
                </span>{' '}
                — <span className="font-mono-tabular text-xs text-[#E04F33]">General Secretary</span>
              </p>
              <p className="text-[#5C5B57] dark:text-[#94938E]">
                <span className="text-[#0A0A0C] dark:text-[#F5F4F0] font-semibold">
                  Aditya Singh Nayal
                </span>{' '}
                — <span className="font-mono-tabular text-xs text-[#4F46E5] dark:text-[#A5B4FC]">Secretary</span>
              </p>
            </div>
          </div>

          {/* Right Section - Copyright */}
          <div className="text-xs text-[#5C5B57] dark:text-[#94938E] text-center lg:text-right font-mono-tabular space-y-1">
            <p className="text-[#0A0A0C] dark:text-[#F5F4F0] font-medium">
              © {new Date().getFullYear()} Learn JKLU · Past Question Paper Portal
            </p>
            <p>JK Lakshmipat University, Jaipur</p>
          </div>
        </div>

        {/* Monochrome Dimensional Drawing Title-Block Strip + Interactive Spec Grid Toggle */}
        <div className="dw-titleblock rounded-lg overflow-hidden text-[10px] font-mono-tabular uppercase tracking-wider">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#5C5B57] dark:text-[#94938E]">
              <span>
                DWG NO. <strong className="text-[#0A0A0C] dark:text-[#F5F4F0]">JKLU-PORTAL-2026</strong>
              </span>
              <span className="hidden sm:inline text-[#0A0A0C]/25 dark:text-white/20">|</span>
              <span>
                REV <strong className="text-[#0A0A0C] dark:text-[#F5F4F0]">2.0</strong>
              </span>
              <span className="hidden sm:inline text-[#0A0A0C]/25 dark:text-white/20">|</span>
              <span className="hidden sm:inline">
                SCALE <strong className="text-[#0A0A0C] dark:text-[#F5F4F0]">1:1</strong>
              </span>
              <span className="hidden md:inline text-[#0A0A0C]/25 dark:text-white/20">|</span>
              <span className="hidden md:inline">
                UNITS <strong className="text-[#0A0A0C] dark:text-[#F5F4F0]">ACADEMIC</strong>
              </span>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={specGrid}
              onClick={toggleSpecGrid}
              title="Toggle architectural drafting grid overlay across the portal"
              className={`px-2.5 py-1 rounded border text-[10px] font-semibold inline-flex items-center gap-1.5 transition-colors duration-150 active:scale-[0.97] ${
                specGrid
                  ? 'border-[#0A0A0C] bg-[#0A0A0C] text-white dark:border-[#F5F4F0] dark:bg-[#F5F4F0] dark:text-[#0A0A0C]'
                  : 'border-[#0A0A0C]/25 dark:border-white/20 bg-white dark:bg-[#141418] text-[#0A0A0C] dark:text-[#F5F4F0] hover:border-[#0A0A0C]'
              }`}
            >
              <Grid className="w-3 h-3 shrink-0" />
              <span>Spec Grid: {specGrid ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
