import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface QrCodeModalProps {
  title: string;
  value: string;
  fileName: string;
  onClose: () => void;
}

export function QrCodeModal({ title, value, fileName, onClose }: QrCodeModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError(null);
    QRCode.toDataURL(value, { width: 320, margin: 1 })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [value]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${fileName}.png`;
    a.click();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={download} disabled={!dataUrl}>Download PNG</Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {dataUrl && (
          <img
            src={dataUrl}
            alt="QR code"
            className="h-64 w-64 rounded-lg border border-slate-200 dark:border-slate-700"
          />
        )}
        <p className="break-all text-center text-xs text-slate-500 dark:text-slate-400">{value}</p>
      </div>
    </Modal>
  );
}
