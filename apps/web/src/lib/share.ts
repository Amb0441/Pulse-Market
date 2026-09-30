/**
 * Share and directions links; both targets are plain URLs, so no backend is involved.
 */

import { isInPhilippines } from './geo';

/**
 * Canonical listing URL: the app root with the listing id in the hash, since there is no per-listing route.
 */
export function listingUrl(listingId: string, base?: string): string {
  const origin =
    base ?? (typeof window !== 'undefined' ? window.location.origin : 'https://pulse.market');
  return `${origin.replace(/\/+$/, '')}/#/listing/${encodeURIComponent(listingId)}`;
}

/**
 * Plain-text share body; includes the price and omits the seller's exact coordinates.
 */
export function shareText(title: string, priceLabel: string): string {
  return `${title} - ${priceLabel} on Pulse Market`;
}

/**
 * Hands a listing to the OS share sheet, falling back to the clipboard; returns which route was taken.
 */
export async function shareListing(
  url: string,
  text: string,
): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: text, text, url });
      return 'shared';
    } catch (err) {
      // A dismissed share sheet throws AbortError and is reported as failed;
      // anything else falls through to the clipboard.
      if (err instanceof Error && err.name === 'AbortError') return 'failed';
    }
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return 'copied';
    }
  } catch {
    // Clipboard blocked (insecure context, or permission denied). Fall through.
  }

  return 'failed';
}

/**
 * Google Maps directions link for a listing's pickup point; null when the listing has no usable coordinates.
 */
export function directionsUrl(lat?: number, lng?: number): string | null {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  /**
   * Bounds are imported rather than repeated, so this cannot drift from the check signup validates against.
   */
  if (
    !isInPhilippines({ lat, lng })
  ) {
    return null;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
