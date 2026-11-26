import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FlipHorizontal2,
  RotateCcw,
  Move,
  Check,
} from 'lucide-react';

interface FacultyPhotoCropModalProps {
  file: File | null;
  onCancel: () => void;
  onSave: (dataUrl: string, sizeKb: number) => Promise<void> | void;
  viewportWidth?: number;
  viewportHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  maxKb?: number;
  title?: string;
  subtitle?: string;
  saveLabel?: string;
}

export const FacultyPhotoCropModal: React.FC<FacultyPhotoCropModalProps> = ({
  file,
  onCancel,
  onSave,
  viewportWidth = 260,
  viewportHeight = 260,
  outputWidth = 320,
  outputHeight = 320,
  maxKb = 120,
  title = 'Adjust & Crop Faculty Photo',
  subtitle = 'Drag to reposition, zoom, or rotate. Saved automatically as lightweight WebP (< 120 KB).',
  saveLabel = 'Save WebP Photo',
}) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });
  const imgElRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!file) {
      setImgSrc(null);
      setImgDims(null);
      return;
    }
    setError(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
    setFlipH(false);

    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      setError('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Original image must be under 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setError('Could not read the selected image.');
    reader.onload = () => {
      const src = String(reader.result || '');
      const probe = new Image();
      probe.onerror = () => setError('Invalid image file.');
      probe.onload = () => {
        imgElRef.current = probe;
        setImgDims({ w: probe.naturalWidth, h: probe.naturalHeight });
        setImgSrc(src);
      };
      probe.src = src;
    };
    reader.readAsDataURL(file);
  }, [file]);

  if (!file) return null;

  // Base scale so the image covers the crop viewport cleanly at zoom=1
  const baseScale = imgDims
    ? Math.max(viewportWidth / imgDims.w, viewportHeight / imgDims.h)
    : 1;

  const clampOffset = (nx: number, ny: number, z: number) => {
    if (!imgDims) return { x: 0, y: 0 };
    const isRotated90 = Math.abs(rotation % 180) === 90;
    const effW = (isRotated90 ? imgDims.h : imgDims.w) * baseScale * z;
    const effH = (isRotated90 ? imgDims.w : imgDims.h) * baseScale * z;
    const maxX = Math.max(0, (effW - viewportWidth) / 2);
    const maxY = Math.max(0, (effH - viewportHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.origX + dx, dragRef.current.origY + dy, zoom));
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  const handleZoomChange = (nextZoom: number) => {
    const clamped = Math.max(1, Math.min(3, Number(nextZoom.toFixed(2))));
    setZoom(clamped);
    setOffset((prev) => clampOffset(prev.x, prev.y, clamped));
  };

  const handleRotate = () => {
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    setOffset({ x: 0, y: 0 });
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
    setFlipH(false);
  };

  const handleConfirmCrop = async () => {
    const img = imgElRef.current;
    if (!img || !imgDims) return;
    setSaving(true);
    setError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported in this browser.');

      ctx.fillStyle = '#0F121C';
      ctx.fillRect(0, 0, outputWidth, outputHeight);

      const ratioX = outputWidth / viewportWidth;
      const ratioY = outputHeight / viewportHeight;
      const ratio = (ratioX + ratioY) / 2;
      ctx.save();
      ctx.translate(outputWidth / 2 + offset.x * ratioX, outputHeight / 2 + offset.y * ratioY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale((flipH ? -1 : 1) * baseScale * zoom * ratio, baseScale * zoom * ratio);
      ctx.drawImage(img, -imgDims.w / 2, -imgDims.h / 2, imgDims.w, imgDims.h);
      ctx.restore();

      const qualities = [0.84, 0.74, 0.64, 0.52, 0.42, 0.34];
      const hardMaxBytes = (maxKb + 35) * 1024;
      let bestDataUrl = '';
      let bestBytes = Infinity;
      for (const q of qualities) {
        const candidate = canvas.toDataURL('image/webp', q);
        if (!candidate.startsWith('data:image/webp;base64,')) {
          throw new Error('Your browser does not support WebP conversion.');
        }
        const approxBytes = Math.ceil(
          ((candidate.length - 'data:image/webp;base64,'.length) * 3) / 4
        );
        bestDataUrl = candidate;
        bestBytes = approxBytes;
        if (approxBytes <= maxKb * 1024) break;
      }

      if (bestBytes > hardMaxBytes) {
        throw new Error(
          `Converted WebP image exceeds ${Math.round(hardMaxBytes / 1024)} KB. Try a simpler image.`
        );
      }

      const sizeKb = Math.max(1, Math.round(bestBytes / 1024));
      await onSave(bestDataUrl, sizeKb);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save photo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop-enter fixed inset-0 z-[60] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`modal-panel-enter w-full ${
          viewportWidth > 320 ? 'max-w-xl' : 'max-w-md'
        } rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] p-5 sm:p-6 space-y-5`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0A0A0C]">{title}</h3>
            <p className="text-xs text-[#353430] mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close crop modal"
            className="p-1.5 rounded-lg hover:bg-black/5 text-[#353430]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        {/* Interactive Square Crop Viewport */}
        {imgSrc && imgDims && (
          <div className="flex flex-col items-center gap-3">
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={(e) => {
                e.preventDefault();
                handleZoomChange(zoom + (e.deltaY < 0 ? 0.12 : -0.12));
              }}
              style={{ width: viewportWidth, height: viewportHeight, maxWidth: '100%' }}
              className="relative rounded-2xl overflow-hidden bg-[#12131A] border-2 border-[#0A0A0C] shadow-inner cursor-grab active:cursor-grabbing select-none touch-none"
            >
              <img
                src={imgSrc}
                alt="Crop preview"
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: imgDims.w,
                  height: imgDims.h,
                  maxWidth: 'none',
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${
                    flipH ? -1 : 1
                  }, 1) scale(${baseScale * zoom})`,
                  transformOrigin: 'center center',
                }}
              />
              {/* Rule-of-thirds subtle crop guide */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, idx) => (
                  <div key={idx} className="border border-white/20" />
                ))}
              </div>
              <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-mono-tabular inline-flex items-center gap-1 backdrop-blur-sm">
                <Move className="w-3 h-3" />
                <span>Drag to adjust</span>
              </div>
            </div>

            {/* Zoom Slider */}
            <div className="w-full flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleZoomChange(zoom - 0.15)}
                className="p-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#0A0A0C] text-[#0A0A0C]"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                className="flex-1 accent-[#E04F33] cursor-pointer"
                aria-label="Zoom photo"
              />
              <button
                type="button"
                onClick={() => handleZoomChange(zoom + 0.15)}
                className="p-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#0A0A0C] text-[#0A0A0C]"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="font-mono-tabular text-xs font-semibold text-[#353430] w-11 text-right">
                {zoom.toFixed(1)}×
              </span>
            </div>

            {/* Transform Toolbar: Rotate, Flip, Reset */}
            <div className="w-full flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleRotate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#896ABD] text-xs font-semibold text-[#0A0A0C]"
              >
                <RotateCw className="w-3.5 h-3.5 text-[#896ABD]" />
                <span>Rotate 90°</span>
              </button>
              <button
                type="button"
                onClick={() => setFlipH((f) => !f)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  flipH
                    ? 'border-[#896ABD] bg-[#896ABD]/12 text-[#5B3B96]'
                    : 'border-[#DDD8CE] bg-[#FAF9F6] text-[#0A0A0C] hover:border-[#896ABD]'
                }`}
              >
                <FlipHorizontal2 className="w-3.5 h-3.5 text-[#896ABD]" />
                <span>Flip</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#0A0A0C] text-xs font-semibold text-[#353430]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E2DC]">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-[#DDD8CE] text-xs font-semibold text-[#0A0A0C]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!imgSrc || saving}
            onClick={handleConfirmCrop}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 disabled:opacity-50 text-white text-xs font-semibold shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Converting to WebP...' : saveLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
