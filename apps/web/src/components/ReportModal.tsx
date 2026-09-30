import React, { useEffect, useRef, useState } from 'react';
import { X, Flag, CheckCircle2, Loader2 } from 'lucide-react';
import { useReportListing } from '../hooks/useQueries';
import { friendlyError } from '../lib/errors';
import type { Listing } from '../types';

interface ReportModalProps {
  listing: Listing | null;
  onClose: () => void;
  theme: 'dark' | 'light';
}

/** Report reasons: exactly the set `reportReason` in backend/src/schemas.ts
 * validates against. Values must move with the API; labels are the plain
 * descriptions shown to the member. */
const REASONS: { value: string; label: string; hint: string }[] = [
  { value: 'scam', label: 'Scam or fraud', hint: 'Payment taken, item not as described, or obvious fraud' },
  { value: 'prohibited', label: 'Prohibited item', hint: 'Weapons, drugs, or anything illegal to sell' },
  { value: 'spam', label: 'Spam or misleading', hint: 'Repeated posts, or a description that is not true' },
  { value: 'duplicate', label: 'Duplicate listing', hint: 'The same item posted more than once' },
  { value: 'inappropriate', label: 'Inappropriate content', hint: 'Offensive photos or text' },
  { value: 'other', label: 'Something else', hint: 'Tell us below' },
];

const MAX_DETAILS = 1000;

export const ReportModal: React.FC<ReportModalProps> = ({ listing, onClose, theme }) => {
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<'sent' | 'already' | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const { mutate: report, isPending } = useReportListing();

  // Reset for each new listing so the previous report's success state and
  // reason do not carry over.
  useEffect(() => {
    if (listing) {
      setReason('');
      setDetails('');
      setError('');
      setDone(null);
      setTimeout(() => modalRef.current?.querySelector('button')?.focus(), 100);
    }
  }, [listing]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    if (listing) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [listing, onClose]);

  if (!listing) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!reason) {
      setError('Please choose a reason.');
      return;
    }
    report(
      { id: listing.id, reason, details: details.trim() || undefined },
      {
        onSuccess: (res) => setDone(res?.alreadyReported ? 'already' : 'sent'),
        onError: (err) => setError(friendlyError(err, 'We could not submit your report.')),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center sm:p-4 bg-ink/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[94vh] sm:max-h-[90vh] bg-card border border-line rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col animate-scale-in"
        data-theme={theme}
      >
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-4">
          <div>
            <h2 id="report-modal-title" className="font-display text-xl font-bold text-ink">
              Report listing
            </h2>
            <p className="text-sm text-ink-soft mt-0.5 truncate">{listing.title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring"
          >
            <X className="w-5 h-5 text-ink" aria-hidden="true" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-moss grid place-items-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-white" aria-hidden="true" />
            </div>
            <h3 className="font-display text-xl font-bold text-ink">
              {done === 'already' ? 'You already reported this' : 'Report received'}
            </h3>
            <p className="mt-1 text-sm text-ink-soft">
              {done === 'already'
                ? 'We already have your report for this listing and it is being reviewed.'
                : 'Thank you. Someone will look at this. We do not tell the seller who reported them.'}
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full h-11 rounded-full bg-clay hover:bg-clay-hover text-white font-semibold text-sm transition-colors touch-manipulation focus-ring"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto no-scrollbar flex-1 p-5 sm:p-6 space-y-4" noValidate>
            <div role="radiogroup" aria-label="Reason for reporting" className="space-y-2">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    reason === r.value ? 'border-clay bg-clay/5' : 'border-line hover:bg-sand'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-1 accent-clay"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{r.label}</span>
                    <span className="block text-xs text-ink-soft mt-0.5">{r.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Anything else? (optional)</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={MAX_DETAILS}
                placeholder="What should we know?"
                className="mt-1.5 w-full px-3.5 py-3 rounded-lg border border-line bg-paper text-sm placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 resize-none transition-smooth"
              />
              <p className="mt-1 text-xs text-ink-muted text-right">
                {details.length}/{MAX_DETAILS}
              </p>
            </label>

            {error && (
              <p role="alert" className="text-sm text-red-600 flex items-center gap-1.5">
                <Flag className="w-4 h-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending || !reason}
              className="w-full h-12 rounded-full bg-clay hover:bg-clay-hover disabled:bg-line disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors touch-manipulation focus-ring active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {isPending ? 'Submitting\u2026' : 'Submit report'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
