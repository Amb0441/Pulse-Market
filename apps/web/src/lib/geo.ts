/**
 * Geolocation helpers for a Philippines-only marketplace, using stored coordinates.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Roughly the centre of the archipelago, used as the map's opening view. */
export const PH_CENTER: LatLng = { lat: 12.5, lng: 122.5 };

/**
 * Loose bounding box of the Philippines, used to reject obviously wrong points.
 */
export const PH_BOUNDS = {
  minLat: 4.5,
  maxLat: 21.5,
  minLng: 116.5,
  maxLng: 126.5,
};

export const OUTSIDE_PH_MESSAGE =
  'That point is outside the Philippines. Please pick a spot inside the country.';

/** True when the point is plausibly inside the Philippines. */
export function isInPhilippines({ lat, lng }: LatLng): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= PH_BOUNDS.minLat &&
    lat <= PH_BOUNDS.maxLat &&
    lng >= PH_BOUNDS.minLng &&
    lng <= PH_BOUNDS.maxLng
  );
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres between two points. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A readable place label, without needing a reverse-geocoding API. */
export function describeArea({ lat, lng }: LatLng): string {
  const latLabel = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}`;
  const lngLabel = `${Math.abs(lng).toFixed(2)}°${lng < 0 ? 'W' : 'E'}`;
  return `${latLabel}, ${lngLabel}`;
}
