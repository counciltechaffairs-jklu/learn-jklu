import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { EASE_OUT } from '@/components/animations/MotionPrimitives';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type, isVisible, onClose, duration = 4000 }) => {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  const icons = {
    success: CheckCircle,
    error: XCircle,
    info: AlertCircle,
  };

  const accents = {
    success: 'border-emerald-500/35 text-emerald-800 dark:text-emerald-200',
    error: 'border-[#E04F33]/40 text-rose-800 dark:text-rose-200',
    info: 'border-[#896ABD]/40 text-[#353430] dark:text-[#F5F4F0]',
  };

  const iconTint = {
    success: 'text-emerald-600',
    error: 'text-[#E04F33]',
    info: 'text-[#896ABD]',
  };

  const Icon = icons[type];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -14, scale: 0.96, x: '-50%' }}
          animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
          exit={{ opacity: 0, y: -10, scale: 0.97, x: '-50%' }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
          className="fixed top-4 left-1/2 z-[100] max-w-md w-full px-4 sm:px-6"
        >
          <div
            className={`rounded-xl bg-white/95 dark:bg-[#121216]/95 backdrop-blur-md shadow-[0_8px_30px_rgba(10,10,12,0.12)] border px-4 py-3 flex items-center justify-between gap-3 ${accents[type]}`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Icon className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 ${iconTint[type]}`} />
              <p className="font-medium text-xs sm:text-sm truncate flex-1">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors active:scale-[0.95] flex-shrink-0"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Toast;
