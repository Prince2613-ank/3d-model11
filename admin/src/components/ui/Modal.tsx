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
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* flex-col + overflow-hidden here (not on the scrolling body below) so the
          header and footer are genuinely separate boxes that never share a
          scroll/stacking context with the content — nothing can visually bleed
          through them while the body scrolls, unlike the old sticky-header approach. */}
      <div className={`flex max-h-[94dvh] w-full ${WIDTHS[size]} flex-col overflow-hidden rounded-t-[26px] border border-white/60 bg-white shadow-2xl dark:border-slate-700/60 dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-2xl`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900 sm:px-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:p-6">
          <div className="space-y-3">{children}</div>
        </div>

        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900 [&>*]:flex-1 sm:px-6 sm:[&>*]:flex-none">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
