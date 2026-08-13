function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

let activeImage: HTMLImageElement | null = null;
let resolveCrop: ((blob: Blob | null) => void) | null = null;
let bound = false;

function updatePreview(): void {
  if (!activeImage) return;
  const viewport = el<HTMLElement>("photoCropViewport");
  const range = el<HTMLInputElement>("photoCropRange");
  viewport.style.backgroundImage = `url(${activeImage.src})`;
  viewport.style.backgroundPosition = `center ${range.value}%`;
}

function closeModal(result: Blob | null): void {
  el<HTMLElement>("photoCropModal").hidden = true;
  if (activeImage) URL.revokeObjectURL(activeImage.src);
  activeImage = null;
  const resolve = resolveCrop;
  resolveCrop = null;
  resolve?.(result);
}

function confirmCrop(): void {
  const img = activeImage;
  if (!img) { closeModal(null); return; }

  const viewport = el<HTMLElement>("photoCropViewport");
  const range = el<HTMLInputElement>("photoCropRange");
  const vpSize = viewport.clientWidth;

  // Same math as the CSS `background-size: cover` preview, so the exported
  // crop matches exactly what the slider showed — center horizontally,
  // slide vertically with the range value (0% = top of photo, 100% = bottom).
  const scale = Math.max(vpSize / img.naturalWidth, vpSize / img.naturalHeight);
  const excessX = img.naturalWidth * scale - vpSize;
  const excessY = img.naturalHeight * scale - vpSize;
  const pct = Number(range.value) / 100;

  const sourceSize = vpSize / scale;
  const sourceX = (excessX / 2) / scale;
  const sourceY = (excessY * pct) / scale;

  const OUTPUT = 480;
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) { closeModal(null); return; }

  ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT);
  canvas.toBlob((blob) => closeModal(blob), "image/jpeg", 0.9);
}

function bindOnce(): void {
  if (bound) return;
  bound = true;
  el<HTMLInputElement>("photoCropRange").addEventListener("input", updatePreview);
  el<HTMLButtonElement>("photoCropConfirmBtn").addEventListener("click", confirmCrop);
  el<HTMLButtonElement>("photoCropCancelBtn").addEventListener("click", () => closeModal(null));
  el<HTMLButtonElement>("photoCropCloseBtn").addEventListener("click", () => closeModal(null));
}

/**
 * Opens the crop modal for a selected image file and resolves with a square
 * JPEG blob once the user confirms, or null if they cancel. Defaults the
 * slider to 20% (biased toward the top of the photo) since a headshot's face
 * usually sits there — closer to a sane "passport photo" crop out of the box
 * than a dead-center default, while still letting the user adjust it.
 */
export function openPhotoCrop(file: File): Promise<Blob | null> {
  bindOnce();
  return new Promise((resolve) => {
    resolveCrop = resolve;
    const img = new Image();
    img.onload = () => {
      activeImage = img;
      el<HTMLInputElement>("photoCropRange").value = "20";
      updatePreview();
    };
    img.src = URL.createObjectURL(file);
    el<HTMLElement>("photoCropModal").hidden = false;
  });
}
