import React from 'react';
import { ImageOff } from 'lucide-react';

interface ListingImageProps {
  /** The listing's image array. May legitimately be empty. */
  images: string[];
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** Rendered instead of an <img> when there is no usable image. */
  fallbackClassName?: string;
}

/** Renders a listing photo, or a neutral placeholder when there is not one.
 * `images` is JSONB defaulting to [], so `images[0]` is often undefined;
 * passing it to `src` yields an <img> with no source and a spurious 404. */
export const ListingImage: React.FC<ListingImageProps> = ({
  images,
  alt,
  className = '',
  loading = 'lazy',
  fallbackClassName = 'bg-sand',
}) => {
  // Check shape as well as length: the JSONB column could hold anything.
  const src = Array.isArray(images) ? images.find((u) => typeof u === 'string' && u.startsWith('https://')) : undefined;

  if (!src) {
    return (
      <div
        className={`${fallbackClassName} grid place-items-center ${className}`}
        role="img"
        aria-label={alt ? `${alt} (no photo)` : 'No photo'}
      >
        <ImageOff className="w-6 h-6 text-ink-soft/60" strokeWidth={1.5} aria-hidden="true" />
      </div>
    );
  }

  return <img src={src} alt={alt} loading={loading} className={className} />;
};
