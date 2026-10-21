import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

// What Tab can reach inside the dialog.
const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex='0']";

// Keeps Tab inside the dialog, so focus cannot wander to what the modal pauses. Focus on the
// dialog itself (on open with nothing to focus, or after a click on its text) counts as the
// start, so Shift+Tab from there wraps to the end.
function trapTab(event: KeyboardEvent<HTMLElement>) {
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)); // → HTMLElement[]
  const first = focusable.at(0);
  const last = focusable.at(-1);
  if (!first || !last) return;
  const atStart =
    document.activeElement === first || document.activeElement === event.currentTarget;
  if (event.shiftKey && atStart) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// Remembers what had focus and moves it into the dialog (its first control, or the dialog
// itself), so Escape and Tab work at once; gives it back when the modal closes.
function useFocusHandoff(dialog: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const opener = document.activeElement; // → Element | null
    const box = dialog.current; // → HTMLElement | null
    if (box) (box.querySelector<HTMLElement>(FOCUSABLE) ?? box).focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [dialog]);
}

/**
 * A modal dialog over its container (ADR-062): a scrim that pauses what is behind it, focus
 * moved in on open (to the first control, or the dialog itself), a focus trap, Escape to
 * close, and focus returned to where it was when the modal closes.
 * It covers its nearest positioned ancestor, so a modal opened in the thread covers only
 * the thread, not the whole app.
 * @param labelledBy The id of the element that names the dialog.
 * @param onClose Called on Escape; the caller decides what closing means.
 * @param onKeyDown Extra keys for the dialog's own content (runs before Escape handling).
 */
export function Modal({
  labelledBy,
  onClose,
  onKeyDown,
  className,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useFocusHandoff(dialog);

  function keys(event: KeyboardEvent<HTMLElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Tab") trapTab(event);
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  // A <dialog> shown in place with `open`, not in the top layer with showModal(), which would
  // cover the whole page; aria-modal still tells assistive technology the rest is paused.
  return (
    <div className="modal-backdrop">
      <dialog
        ref={dialog}
        open
        className={className ? `modal ${className}` : "modal"}
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={keys}
      >
        {children}
      </dialog>
    </div>
  );
}
