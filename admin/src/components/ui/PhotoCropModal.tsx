import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

interface PhotoCropModalProps {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

const OUTPUT_SIZE = 480;

/**
 * Lets the user pick a vertical crop before a photo is uploaded, instead of
 * silently center-cropping whatever aspect ratio they selected. The preview
 * circle uses `background-size: cover` + `background-position: center Y%`,
 * so the exported canvas crop (same Y% math against the natural image size)
 * matches exactly what was previewed.
 */
export function PhotoCropModal({ file, onCancel, onConfirm }: PhotoCropModalProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [percent, setPercent] = useState(20);
  const [confirming, setConfirming] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    const img = new Image();
    img.onload = () => { imageRef.current = img; };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const confirm = () => {
    const img = imageRef.current;
    const viewport = viewportRef.current;
    if (!img || !viewport) return;
    setConfirming(true);

    // Measure the actual rendered box rather than assuming a constant —
    // Tailwind's border-box sizing means `h-[220px] w-[220px] border-2`
    // renders a 216px content/positioning area (220 minus the 2px border on
    // each side), and that's what `background-position` math is computed
    // against, so the exported crop must use the same real number.
    const vpSize = viewport.clientWidth;
    const scale = Math.max(vpSize / img.naturalWidth, vpSize / img.naturalHeight);
    const excessX = img.naturalWidth * scale - vpSize;
    const excessY = img.naturalHeight * scale - vpSize;
    const pct = percent / 100;

    const sourceSize = vpSize / scale;
    const sourceX = (excessX / 2) / scale;
    const sourceY = (excessY * pct) / scale;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setConfirming(false); return; }

    ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob((blob) => {
      setConfirming(false);
      if (blob) onConfirm(blob);
    }, "image/jpeg", 0.9);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Adjust photo</h3>
          <button onClick={onCancel} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" aria-label="Close">✕</button>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Drag the slider so the face sits inside the circle — this is exactly how the photo will show.</p>
        <div
          ref={viewportRef}
          className="mx-auto mb-3 h-[220px] w-[220px] rounded-full border-2 border-slate-200 bg-slate-100 bg-cover bg-no-repeat dark:border-slate-700 dark:bg-slate-800"
          style={objectUrl ? { backgroundImage: `url(${objectUrl})`, backgroundPosition: `center ${percent}%` } : undefined}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
          className="mb-4 block w-full"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={confirm} disabled={confirming}>{confirming ? "Saving…" : "Use this photo"}</Button>
        </div>
      </div>
    </div>
  );
}
