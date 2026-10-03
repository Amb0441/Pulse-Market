import React, { useState, useEffect, useRef } from 'react';
import { Listing } from '../types';
import { X, Heart, MessageSquare, MapPin, Share2, Navigation, Flag, ImageOff } from 'lucide-react';
import { formatPrice } from '../lib/format';
import { directionsUrl, listingUrl, shareListing, shareText } from '../lib/share';
import { notifyError, notifySuccess } from '../stores/useToasts';
import { ReportModal } from './ReportModal';
import { Avatar } from './Avatar';

interface ListingDetailModalProps {
  listing: Listing | null;
  onClose: () => void;
  onToggleSave: (listingId: string) => void;
  /** Ids of the signed-in member's saved items, from the server. */
  savedListingIds: string[];
  onStartChat: (listing: Listing) => void;
  theme: 'dark' | 'light';
  /** Distinguishes the owner from a buyer, so owner-only controls can be hidden. */
  currentUserId?: string;
}

export const ListingDetailModal: React.FC<ListingDetailModalProps> = ({
  listing,
  onClose,
  onToggleSave,
  savedListingIds,
  onStartChat,
  theme,
  currentUserId,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const modalRef = useRef<HTMLDivElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  // An owner is not a buyer: no one to message, no one to report.
  const isOwner = Boolean(listing && currentUserId && listing.sellerId === currentUserId);

  /** Shares the listing URL, copying the link when no share sheet is available. */
  const handleShare = async () => {
    if (!listing) return;
    const outcome = await shareListing(
      listingUrl(listing.id),
      shareText(listing.title, formatPrice(listing.price)),
    );
    if (outcome === 'copied') notifySuccess('Link copied to your clipboard.');
    // 'shared' and 'failed' stay silent: the OS sheet is its own feedback.
  };

  const handleDirections = () => {
    if (!listing) return;
    const url = directionsUrl(listing.lat, listing.lng);
    if (!url) {
      // No usable pin: say so rather than opening a map that cannot find it.
      notifyError(
        new Error('This listing has no usable map pin, so we cannot give directions.'),
        'No directions available for this listing.',
      );
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (listing) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      setCurrentImageIndex(0);
      setTimeout(() => modalRef.current?.querySelector('button')?.focus(), 100);
    } else {
      document.body.style.overflow = 'unset';
      lastFocusedElement.current?.focus();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [listing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!listing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // With no images this would wrap to -1 and index off the front.
        const count = listing.images.filter((u) => typeof u === 'string' && u.startsWith('https://')).length;
        if (count === 0) return;
        setCurrentImageIndex((prev) => {
          const current = prev % count;
          return e.key === 'ArrowLeft'
            ? (current === 0 ? count - 1 : current - 1)
            : (current === count - 1 ? 0 : current + 1);
        });
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
  }, [listing, onClose]);

  if (!listing) return null;

  const sold = listing.status === 'sold';

  // `images` is JSONB defaulting to [], so filter to real https URLs before
  // indexing - otherwise currentImageIndex can address a hole in the array.
  const usableImages = listing.images.filter(
    (u) => typeof u === 'string' && u.startsWith('https://'),
  );

  // Saved state comes from the server-backed set so this heart and the feed
  // card always agree; the update is optimistic so the fill lands on tap.
  const isSaved = savedListingIds.includes(listing.id);
  const handleToggleSave = () => {
    onToggleSave(listing.id);
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center sm:p-4 bg-ink/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="listing-detail-title"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[min(94dvh,100%)] sm:max-h-[90vh] bg-card border border-line rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col animate-scale-in"
      >
        <div className="relative">
          <div className="aspect-4/3 sm:aspect-[4/3] overflow-hidden">
            {usableImages.length > 0 ? (
              <img
                src={usableImages[Math.min(currentImageIndex, usableImages.length - 1)]}
                alt={listing.title}
                className={`w-full h-full object-cover transition-opacity duration-300 ${sold ? 'grayscale opacity-70' : ''}`}
              />
            ) : (
              <div
                className="w-full h-full bg-sand grid place-items-center"
                role="img"
                aria-label={`${listing.title} (no photo)`}
              >
                <div className="text-center px-6">
                  <ImageOff className="w-8 h-8 mx-auto text-ink-soft/60" strokeWidth={1.5} aria-hidden="true" />
                  <p className="mt-2 text-sm text-ink-soft">No photo was added to this listing</p>
                </div>
              </div>
            )}
          </div>

          {usableImages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2" role="tablist" aria-label="Listing images">
              {usableImages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentImageIndex(i)}
                  role="tab"
                  aria-selected={currentImageIndex === i}
                  aria-label={`View image ${i + 1} of ${usableImages.length}`}
                  className={`w-2 h-2 rounded-full transition-all touch-manipulation ${
                    currentImageIndex === i ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/75'
                  }`}
                />
              ))}
            </div>
          )}

          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 backdrop-blur grid place-items-center hover:bg-white transition-colors touch-manipulation focus-ring shadow-md"
          >
            <X className="w-5 h-5 text-ink" aria-hidden="true" />
          </button>

          {/* Hidden rather than disabled on your own listing; the server also
              rejects saving an item you already control. */}
          {listing.sellerId !== currentUserId && (
            <button
              onClick={handleToggleSave}
              aria-label={isSaved ? 'Remove from saved' : 'Save item'}
              aria-pressed={isSaved}
              className="absolute top-3 left-3 w-10 h-10 rounded-full bg-white/90 backdrop-blur grid place-items-center hover:bg-white transition-colors touch-manipulation focus-ring shadow-md"
            >
              <Heart className={`w-5 h-5 ${isSaved ? 'fill-current text-clay' : 'text-ink'}`} aria-hidden="true" />
            </button>
          )}

          {listing.status !== 'active' && (
            <span
              className={`absolute bottom-3 left-3 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                sold ? 'bg-ink text-paper' : 'bg-mustard text-ink'
              }`}
              aria-label={`Status: ${listing.status}`}
            >
              {listing.status}
            </span>
          )}

          {(listing.activeViewers ?? 0) > 0 && listing.status === 'active' && (
            <span className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur text-[11px] font-semibold" aria-label={`${listing.activeViewers} people viewing`}>
              <MapPin className="w-3.5 h-3.5 text-clay" aria-hidden="true" />
              {listing.activeViewers} {listing.activeViewers === 1 ? 'viewer' : 'viewers'}
            </span>
          )}
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto no-scrollbar flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id="listing-detail-title" className="font-display text-2xl font-bold text-ink truncate">{listing.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{listing.category} · {listing.condition}</p>
            </div>
            <div className="shrink-0 flex items-baseline gap-2">
              {listing.originalPrice && (
                <span className="text-sm text-ink-soft line-through">{formatPrice(listing.originalPrice)}</span>
              )}
              <span className="font-display text-2xl font-bold text-ink">
                {formatPrice(listing.price)}
              </span>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-ink whitespace-pre-line">{listing.description}</p>

          <div className="pt-2 border-t border-line flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar
                url={listing.sellerAvatar}
                name={listing.sellerName}
                className="w-10 h-10 rounded-full shrink-0"
              />
              <div>
                <p className="font-semibold text-sm text-ink">{listing.sellerName}</p>
                <p className="text-xs text-ink-soft flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-moss" aria-hidden="true" />
                  {listing.sellerBadge}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { void handleShare(); }}
                className="w-9 h-9 rounded-full border border-line bg-card grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring"
                aria-label="Share listing"
              >
                <Share2 className="w-4 h-4 text-ink" aria-hidden="true" />
              </button>
              {!isOwner && (
                <button
                  onClick={() => setIsReportOpen(true)}
                  className="w-9 h-9 rounded-full border border-line bg-card grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring"
                  aria-label="Report listing"
                >
                  <Flag className="w-4 h-4 text-ink-soft" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-paper p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink flex items-center gap-2">
                <MapPin className="w-4 h-4 text-clay" aria-hidden="true" />
                Pickup location
              </span>
            </div>
            <p className="text-sm text-ink-soft">{listing.exactLocationNote}</p>
            <button
              onClick={handleDirections}
              className="w-full h-10 rounded-lg border border-line bg-card text-sm font-semibold flex items-center justify-center gap-2 hover:bg-sand transition-colors touch-manipulation focus-ring"
            >
              <Navigation className="w-4 h-4" aria-hidden="true" />
              Get directions
            </button>
          </div>

          <div className="flex items-center gap-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-2">
            <button
              onClick={() => {
                if (isOwner) return;
                onClose();
                setTimeout(() => onStartChat(listing), 150);
              }}
              disabled={sold || isOwner}
              className="flex-1 h-12 min-h-12 rounded-full bg-clay hover:bg-clay-hover disabled:bg-line disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors touch-manipulation focus-ring active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
              {isOwner ? 'This is your listing' : sold ? 'Sold' : 'Message seller'}
            </button>
          </div>
        </div>
      </div>

      {isReportOpen && (
        <ReportModal listing={listing} onClose={() => setIsReportOpen(false)} theme={theme} />
      )}
    </div>
  );
};