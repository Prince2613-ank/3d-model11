import { forwardRef } from "react";
import type { ButtonHTMLAttributes, MouseEvent } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300 dark:bg-brand-600 dark:hover:bg-brand-500",
  secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:border-white/10 dark:hover:bg-white/5",
  danger: "bg-rose-600 text-white hover:bg-rose-500 disabled:bg-rose-400 dark:bg-rose-600 dark:hover:bg-rose-500",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

function spawnRipple(event: MouseEvent<HTMLButtonElement>): void {
  const button = event.currentTarget;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const ripple = document.createElement("span");
  ripple.className = "btn-ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  button.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", onMouseDown, ...props }, ref) => (
    <button
      ref={ref}
      onMouseDown={(event) => { if (!event.currentTarget.disabled) spawnRipple(event); onMouseDown?.(event); }}
      className={`btn-ripple-host relative inline-flex min-h-10 items-center justify-center gap-1.5 overflow-hidden rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  )
);
Button.displayName = "Button";
