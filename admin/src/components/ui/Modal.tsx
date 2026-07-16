import type { ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}

const WIDTHS = { md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" };

export function Modal({ isOpen, onClose, title, children, footer, size = "md" }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className={`max-h-[94dvh] w-full ${WIDTHS[size]} overflow-y-auto rounded-t-[26px] border border-white/60 bg-white/95 p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/95 sm:max-h-[90vh] sm:rounded-2xl sm:p-6`}>
        <div className="sticky top-0 z-10 mb-4 flex items-center justify-between bg-white/95 py-1 backdrop-blur dark:bg-slate-900/95">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3">{children}</div>
        {footer && <div className="mt-5 flex [&>*]:flex-1 justify-end gap-2 sm:[&>*]:flex-none">{footer}</div>}
      </div>
    </div>
  );
}
