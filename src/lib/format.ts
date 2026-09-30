/**
 * Timestamp, distance and price formatting; missing or unparseable input returns ''.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function parse(value: string | undefined | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** "Just now", "5m ago", "3h ago", "2d ago", "4w ago", then an absolute date. */
export function formatRelative(value: string | undefined | null, now = Date.now()): string {
  const ms = parse(value);
  if (ms === null) return '';

  const diff = now - ms;
  // A future timestamp means browser/server clock skew; do not render "-2m ago".
  if (diff < MINUTE) return 'Just now';

  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;

  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "28 Sep 2026" - used where an exact date matters more than recency. */
export function formatDate(value: string | undefined | null): string {
  const ms = parse(value);
  if (ms === null) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "2026" - year only, for the profile's "Member since" label. */
export function formatYear(value: string | undefined | null): string {
  const ms = parse(value);
  if (ms === null) return '';
  return String(new Date(ms).getFullYear());
}

/**
 * Distance label in m/km, or '' when there is no distance to show.
 */
export function formatDistance(km: number | undefined | null): string {
  if (km === undefined || km === null || !Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}

/**
 * Price in Philippine pesos; zero renders as "Free" and centavos are preserved.
 */
export function formatPrice(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) return '';
  if (amount === 0) return 'Free';
  const hasCentavos = Math.abs(amount - Math.round(amount)) >= 0.005;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: hasCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
