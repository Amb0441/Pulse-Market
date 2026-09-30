import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { LocationPicker } from './LocationPicker';
import { isInPhilippines, type LatLng } from '../lib/geo';

interface LocationPickerModalProps {
  open: boolean;
  value: LatLng | null;
  onConfirm: (value: LatLng) => void;
  onClose: () => void;
  title?: string;
  description?: string;
  /** Allow confirming a point outside the Philippines. Off by default. */
  allowOutside?: boolean;
  /** Optional name for the area, e.g. "Baguio City". Shown as a text field. */
  label?: string;
  onLabelChange?: (label: string) => void;
  labelLabel?: string;
  labelPlaceholder?: string;
}

/** Map picker in a popup, so the form stays short. Edits are held in a draft so
 * Cancel discards them; Escape, focus trap and scroll lock match SellModal. */
export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  open,
  value,
  onConfirm,
  onClose,
  title = 'Set your location',
  description = 'Drop a pin so we can show you what is nearby. Pick your area, not your exact address.',
  allowOutside = false,
  label,
  onLabelChange,
  labelLabel = 'Area name',
  labelPlaceholder = 'Baguio City, Benguet',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<LatLng | null>(value);

  /** Read `value` through a ref so this effect depends only on `open`: callers
   * pass a fresh `{ lat, lng }` each render, so depending on `value` would
   * re-run this per keystroke and move focus to the confirm button. */
  const latestValue = useRef(value);
  latestValue.current = value;

  useEffect(() => {
    if (open) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      // Re-seed from the committed value on open, so a cancelled attempt does
      // not come back.
      setDraft(latestValue.current);
      setTimeout(() => confirmRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = 'unset';
      lastFocusedElement.current?.focus();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const outside = draft !== null && !allowOutside && !isInPhilippines(draft);
  const canConfirm = draft !== null && !outside;

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm(draft);
    onClose();
  };

  /** Portalled to <body>: an ancestor with a lingering transform becomes the
   * containing block for `position: fixed`, and the landing page's
   * `animate-rise` section clips it with `overflow-hidden`. */
  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center sm:p-4 bg-ink/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-modal-title"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[94vh] sm:max-h-[90vh] bg-card border border-line rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col animate-scale-in"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-4">
          <div>
            <h2 id="location-modal-title" className="font-display text-xl font-bold text-ink">
              {title}
            </h2>
            <p className="text-sm text-ink-soft mt-0.5">{description}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring flex-shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto no-scrollbar px-5 sm:px-6 py-5 space-y-4">
          <LocationPicker value={draft} onChange={setDraft} allowOutside={allowOutside} />

          {onLabelChange && (
            <div>
              <label className="block">
                <span className="text-xs font-semibold text-ink-soft">{labelLabel}</span>
                <input
                  type="text"
                  value={label ?? ''}
                  onChange={(e) => onLabelChange(e.target.value)}
                  maxLength={80}
                  placeholder={labelPlaceholder}
                  className="mt-1 w-full h-11 px-3 rounded-lg border border-line bg-card text-sm text-ink placeholder:text-ink-soft/70 focus-ring"
                />
              </label>
              <p className="mt-1 text-[11px] leading-snug text-ink-soft">
                Shown beside the Pulse logo so neighbors recognise your area. Keep it general.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-11 px-4 rounded-lg text-sm font-semibold text-ink-soft hover:text-ink hover:bg-sand transition-colors focus-ring touch-manipulation"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={confirm}
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-clay hover:bg-clay-hover text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-ring touch-manipulation"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            Use this spot
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
