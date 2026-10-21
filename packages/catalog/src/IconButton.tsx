import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * A square, borderless button holding one icon (ADR-062). The label is required, because
 * an icon alone says nothing to a screen reader; it also becomes the tooltip.
 * @param label What the button does, read aloud and shown on hover.
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>
>(function IconButton({ label, children, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={className ? `icon-btn ${className}` : "icon-btn"}
      {...rest}
    >
      {children}
    </button>
  );
});
