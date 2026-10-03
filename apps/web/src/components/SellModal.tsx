import React, { useState, useEffect, useRef } from 'react';
import { Listing, Category } from '../types';
import { useCreateListing, useUploadImages } from '../hooks/useQueries';
import { toListing } from '../lib/listing';
import { friendlyError } from '../lib/errors';
import { isInPhilippines, type LatLng } from '../lib/geo';
import { LocationPicker } from './LocationPicker';
import type { ApiListing } from '../lib/api';
import { X, Camera, MapPin, CheckCircle2, Loader2, Image } from 'lucide-react';

interface SellModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
}

const CATEGORIES: Category[] = [
  'Furniture',
  'Electronics',
  'Home & Garden',
  'Clothing & Kids',
  'Sports & Outdoors',
  'Books & Media',
  'Free & Giveaway',
  'Other',
];

/** The area is free text because `listings` stores a plain string; there is no
 * neighbourhoods table behind it. */
const MAX_LOCATION_LEN = 120;

const field = 'w-full h-12 px-3.5 rounded-lg border border-line bg-paper text-base placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 transition-smooth';
const labelCls = 'block text-xs font-semibold text-ink-soft mb-1.5';

export const SellModal: React.FC<SellModalProps> = ({ isOpen, onClose }) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('Furniture');
  const [price, setPrice] = useState('');
  const [rawDescription, setRawDescription] = useState('');
  // Uploaded URL: the create schema only accepts https URLs, so it goes to storage first.
  const [imageUrl, setImageUrl] = useState('');
  const [uploadError, setUploadError] = useState('');

  const [area, setArea] = useState('');
  // Real coordinates for distance search; the typed `area` is the buyer-facing label.
  const [pin, setPin] = useState<LatLng | null>(null);

  const { mutate: createListing, isPending: isSubmitting } = useCreateListing();
  const { mutate: uploadImages, isPending: isUploading } = useUploadImages();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      setTimeout(() => firstInputRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = 'unset';
      lastFocusedElement.current?.focus();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Please provide a title and asking price.');
      return;
    }
    if (!price) {
      setError('Please provide a title and asking price.');
      return;
    }
    if (parseFloat(price) < 0) {
      setError('Price cannot be negative.');
      return;
    }
    if (!area.trim()) {
      setError('Tell buyers roughly where to pick up.');
      return;
    }
    if (!pin) {
      setError('Drop a pin on the map so buyers can tell how far away this is.');
      return;
    }
    if (!isInPhilippines(pin)) {
      setError('That pin is outside the Philippines. Please pick a spot inside the country.');
      return;
    }

    // Send only the columns the `listings` table has: the create schema is
    // `.strict()`, and the server assigns user_id and status.
    createListing(
      {
        title: title.trim(),
        description: (rawDescription || title).trim(),
        price: parseFloat(price) || 0,
        category,
        images: imageUrl ? [imageUrl] : [],
        location: area.trim(),
        lat: pin.lat,
        lng: pin.lng,
      },
      {
          onSuccess: () => {
            setSuccess(true);
            setTimeout(onClose, 700);
          },
        onError: (err) => setError(friendlyError(err, 'We could not publish your listing.')),
      },
    );
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');
    uploadImages([file], {
      onSuccess: (data) => setImageUrl(data.images?.[0]?.url ?? ''),
      onError: (err) => {
        setUploadError(
          friendlyError(
            err,
            'Photos need image storage, which is not configured yet. You can still publish without one.',
          ),
        );
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center sm:p-4 bg-ink/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sell-modal-title"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[94vh] sm:max-h-[90vh] bg-card border border-line rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col animate-scale-in"
      >
        <div className="px-6 py-5 border-b border-line flex items-start justify-between gap-4">
          <div>
            <h2 id="sell-modal-title" className="font-display text-2xl font-bold text-ink">List an item</h2>
            <p className="text-sm text-ink-soft mt-0.5">Neighbors will see it on the map and feed.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring flex-shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {success && (
          <div className="px-6 py-4 bg-moss-light border-b border-line animate-slide-down">
            <div className="flex items-center gap-3 text-moss">
              <div className="w-8 h-8 rounded-full bg-moss grid place-items-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-white" aria-hidden="true" />
              </div>
              <span className="font-semibold">Listing posted successfully!</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="overflow-y-auto no-scrollbar flex-1 px-6 py-6 space-y-6" noValidate>
          {error && !success && (
            <div className="px-4 py-3 rounded-lg bg-rose-light border border-rose/30 text-rose text-sm font-medium flex items-center gap-2 animate-slide-down" role="alert">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          <section>
            <span className={labelCls}>Photo <span className="font-normal text-ink-muted">(optional)</span></span>
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-sand flex-shrink-0 grid place-items-center">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Your uploaded listing photo"
                    className="w-full h-full object-cover"
                  />
                ) : isUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-ink-soft" aria-hidden="true" />
                ) : (
                  <Image className="w-6 h-6 text-ink-muted" aria-hidden="true" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="h-10 px-4 rounded-full border border-line bg-card text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-sand transition-colors touch-manipulation focus-within:ring-2 focus-within:ring-clay/30">
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  {isUploading ? 'Uploading...' : imageUrl ? 'Replace photo' : 'Upload a photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    disabled={isUploading}
                    className="sr-only"
                    aria-label="Upload photo"
                  />
                </label>
              </div>
              {uploadError && (
                <p className="text-[11px] text-ink-soft max-w-[13rem]">{uploadError}</p>
              )}
            </div>
          </section>

          <section>
            <label htmlFor="sell-title" className={labelCls}>Title</label>
            <input
              ref={firstInputRef}
              id="sell-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ergonomic office chair"
              className={field}
              required
              autoComplete="off"
              aria-required="true"
            />
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label>
              <span className={labelCls}>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={`${field} cursor-pointer appearance-none`} aria-required="true">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <span className={labelCls}>Price</span>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft text-sm">₱</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="45"
                  className={`${field} pl-8`}
                  required
                  aria-required="true"
                  inputMode="decimal"
                />
              </div>
            </label>
          </section>

          <label className="block">
            <span className={labelCls}>Description & pickup notes</span>
            <textarea
              value={rawDescription}
              onChange={(e) => setRawDescription(e.target.value)}
              rows={3}
              placeholder="Condition, dimensions, when you're free for pickup…"
              className="w-full px-3.5 py-3 rounded-lg border border-line bg-paper text-base placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 resize-none transition-smooth"
              aria-describedby="description-hint"
            />
            <p id="description-hint" className="mt-1 text-xs text-ink-muted">Describe the condition and dimensions here — there is no separate condition field yet, so buyers only see what you write.</p>
          </label>

          <section className="rounded-xl border border-line bg-paper p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink flex items-center gap-2">
                <MapPin className="w-4 h-4 text-clay" aria-hidden="true" />
                Pickup location <span className="text-clay" aria-hidden="true">*</span>
              </span>
              {pin && (
                <span className="text-xs font-semibold text-moss flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Pin set
                </span>
              )}
            </div>

            <LocationPicker
              value={pin}
              onChange={setPin}
              hint="Drop a pin in the area you can hand the item over in."
            />

            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1" htmlFor="area-label">
                Area buyers will see
              </label>
              <input
                id="area-label"
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value.slice(0, MAX_LOCATION_LEN))}
                placeholder="e.g. Riverside, Baguio"
                className={field}
                aria-label="Pickup area"
                maxLength={MAX_LOCATION_LEN}
                required
              />
            </div>

            <p className="text-xs text-ink-soft leading-relaxed">
              The pin powers distance search. Buyers see the area you typed, never your exact
              address, so pick a nearby landmark rather than your door.
            </p>
          </section>

          <button
            type="submit"
            disabled={isSubmitting || success}
            className="w-full h-12 rounded-full bg-clay hover:bg-clay-hover text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation focus-ring active:scale-[0.98] relative overflow-hidden"
          >
            {isSubmitting && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              </span>
            )}
            <span className={isSubmitting ? 'invisible' : ''}>{success ? 'Posted!' : 'Post listing'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};