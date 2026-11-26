import React, { useEffect } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import {
  SPRING_FLUID,
  projectMomentum,
} from '@/components/animations/MotionPrimitives';
import { usePrefersReducedMotion } from '@/components/viz/chartTokens';

export interface LightboxPhotoData {
  src: string;
  name: string;
  designation?: string | null;
  school?: string | null;
}

interface FacultyPhotoLightboxProps {
  photo: LightboxPhotoData | null;
  onClose: () => void;
}

export const FacultyPhotoLightbox: React.FC<FacultyPhotoLightboxProps> = ({
  photo,
  onClose,
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [-240, 0, 240], [0.25, 1, 0.25]);
  const panelScale = useTransform(dragY, [-240, 0, 240], [0.92, 1, 0.92]);

  useEffect(() => {
    if (!photo) return;
    dragY.set(0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [photo, onClose, dragY]);

  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const projected = info.offset.y + projectMomentum(info.velocity.y);
    if (Math.abs(projected) > 110) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {photo && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${photo.name} portrait`}
          onClick={onClose}
          initial={reducedMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{ opacity: backdropOpacity }}
          className="fixed inset-0 z-[70] bg-[#09090D]/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={reducedMotion ? undefined : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 12, scale: 0.96 }}
            transition={SPRING_FLUID}
            drag={reducedMotion ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.15, bottom: 0.55 }}
            onDragEnd={handleDragEnd}
            style={{ y: dragY, scale: panelScale }}
            className="relative max-w-md w-full flex flex-col items-center gap-4 touch-none cursor-grab active:cursor-grabbing"
          >
            {/* Top-Right Floating Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close enlarged photo"
              className="absolute -top-3 -right-3 z-20 w-10 h-10 rounded-full bg-white text-[#0A0A0C] hover:bg-[#E04F33] hover:text-white border border-black/10 shadow-xl flex items-center justify-center transition-colors duration-150 active:scale-[0.95] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Soft Editorial Halo Behind Enlarged Portrait */}
            <div className="relative">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-6 rounded-[36px] blur-3xl opacity-65"
                style={{
                  background:
                    'radial-gradient(circle at 35% 30%, rgba(137,106,189,0.6), rgba(224,79,51,0.35) 55%, transparent 78%)',
                }}
              />
              <div className="relative z-10 w-72 h-72 sm:w-96 sm:h-96 rounded-3xl overflow-hidden bg-[#12131A] ring-4 ring-white/90 shadow-2xl">
                <img
                  src={photo.src}
                  alt={photo.name}
                  draggable={false}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Clean Editorial Caption Pill */}
            <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white/95 backdrop-blur-md border border-white/60 px-5 py-3.5 text-center shadow-xl space-y-1">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold tracking-tight text-[#0A0A0C]">
                  {photo.name}
                </h3>
                {photo.school && (
                  <span className="px-2 py-0.5 rounded-full bg-[#896ABD]/15 border border-[#896ABD]/30 font-mono-tabular text-[10px] font-semibold uppercase text-[#5B3B96]">
                    {photo.school}
                  </span>
                )}
              </div>
              {photo.designation && (
                <p className="text-xs font-medium text-[#353430]">{photo.designation}</p>
              )}
              <p className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#52514C] pt-1">
                Swipe, press Esc, or click outside to close
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
