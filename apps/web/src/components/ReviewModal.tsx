import React, { useState, useEffect, useRef } from 'react';
import { ChatThread, UserProfile } from '../types';
import { X, Star, Send, CheckCircle2 } from 'lucide-react';
import { ListingImage } from './ListingImage';

interface ReviewModalProps {
  chat: ChatThread | null;
  currentUser: UserProfile;
  onClose: () => void;
  /** Sends only what the API accepts; reviewer, target and title are resolved there. */
  onSubmitReview: (input: { conversationId: string; rating: number; comment: string }) => Promise<unknown>;
  theme: 'dark' | 'light';
}

export const ReviewModal: React.FC<ReviewModalProps> = ({ chat, currentUser, onClose, onSubmitReview }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (chat) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      setTimeout(() => modalRef.current?.querySelector('button')?.focus(), 100);
    } else {
      document.body.style.overflow = 'unset';
      lastFocusedElement.current?.focus();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [chat]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!chat) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements?.length) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [chat, onClose]);

  if (!chat) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0 || submitting) return;

    setSubmitting(true);
    try {
      await onSubmitReview({ conversationId: chat.id, rating, comment: comment.trim() });
      setSuccess(true);
      setTimeout(() => onClose(), 600);
    } catch {
      // The mutation cache has already toasted the message; just let them retry.
      setSubmitting(false);
    }
  };

  const StarButton = ({ value }: { value: number }) => (
    <button
      type="button"
      onClick={() => setRating(value)}
      onMouseEnter={() => setHoverRating(value)}
      onMouseLeave={() => setHoverRating(0)}
      disabled={success}
      aria-label={`${value} star${value > 1 ? 's' : ''}`}
      aria-pressed={rating === value}
      className="relative p-1 touch-manipulation focus-ring rounded-lg transition-colors disabled:opacity-50"
    >
      <Star
        className={`w-8 h-8 ${
          value <= (hoverRating || rating) ? 'fill-mustard text-mustard' : 'text-line'
        } transition-colors`}
        aria-hidden="true"
      />
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center sm:p-4 bg-ink/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[94vh] sm:max-h-[90vh] bg-card border border-line rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col animate-scale-in"
      >
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-4">
          <div>
            <h2 id="review-modal-title" className="font-display text-xl font-bold text-ink">Leave a review</h2>
            <p className="text-sm text-ink-soft mt-0.5">Help neighbors trust each other</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring"
          >
            <X className="w-5 h-5 text-ink" aria-hidden="true" />
          </button>
        </div>

        {success && (
          <div className="p-6 text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-moss grid place-items-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-white" aria-hidden="true" />
            </div>
            <h3 className="font-display text-xl font-bold text-ink">Thanks for your review!</h3>
            <p className="mt-1 text-sm text-ink-soft">Your feedback helps build a trusted community.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="overflow-y-auto no-scrollbar flex-1 p-5 sm:p-6 space-y-6" noValidate>
          {!success && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-ink-soft">Your rating</span>
                <div className="flex items-center gap-1 mt-2" role="radiogroup" aria-label="Star rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <StarButton key={n} value={n} />
                  ))}
                </div>
                <p className="mt-2 text-sm text-ink-soft min-h-[20px]">
                  {rating === 0 ? 'Tap a star to rate' : `${rating} out of 5 stars`}
                </p>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-ink-soft">Your experience (optional)</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  placeholder="What went well? Any tips for next time?"
                  className="w-full px-3.5 py-3 rounded-lg border border-line bg-paper text-sm placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 resize-none transition-smooth"
                  maxLength={500}
                />
                <p className="mt-1 text-xs text-ink-muted text-right">{comment.length}/500</p>
              </label>

              <div className="rounded-xl border border-line bg-paper p-4">
                <div className="flex items-center gap-3">
                  <ListingImage
                    images={chat.listingImage ? [chat.listingImage] : []}
                    alt=""
                    className="w-12 h-12 rounded-lg shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate text-ink">{chat.listingTitle}</p>
                    <p className="text-xs text-ink-soft">
                      {chat.sellerId === currentUser.id ? `Sold to ${chat.buyerName}` : `Bought from ${chat.sellerName}`}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={rating === 0 || success || submitting}
                className="w-full h-12 rounded-full bg-clay hover:bg-clay-hover disabled:bg-line disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors touch-manipulation focus-ring active:scale-[0.98] relative"
              >
                {success ? 'Review submitted' : submitting ? 'Submitting…' : 'Submit review'}
              </button>

              <p className="text-center text-xs text-ink-soft">
                Your review shows on their profile, and theirs on yours.
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};