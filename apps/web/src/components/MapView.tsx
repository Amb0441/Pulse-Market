import React, { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Listing } from '../types';
import { Navigation, MapPinOff, LocateFixed } from 'lucide-react';
import { formatDistance, formatPrice } from '../lib/format';

interface MapViewProps {
  listings: Listing[];
  onSelectListing: (listing: Listing) => void;
  selectedRadiusKm: number;
  setSelectedRadiusKm: (radius: number) => void;
  /**
   * The viewer's own saved pin, the origin for the search circle; browser geolocation is only the fallback.
   */
  origin?: { lat: number; lng: number } | null;
}

const RADII = [1, 3, 5, 10];

/**
 * View used before the browser reports a position; a world view claims nothing about anyone's location.
 */
const WORLD_VIEW: [[number, number], number] = [[20, 0], 2];

type GeolocationState = 'pending' | 'granted' | 'denied' | 'unavailable';

export const MapView: React.FC<MapViewProps> = ({
  listings,
  onSelectListing,
  selectedRadiusKm,
  setSelectedRadiusKm,
  origin,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const circleLayerRef = useRef<any>(null);
  const [geoState, setGeoState] = useState<GeolocationState>('pending');
  const [browserCenter, setBrowserCenter] = useState<[number, number] | null>(null);

  // The saved pin is the real origin; browser geolocation is only a fallback, so
  // it is skipped entirely when the pin is known.
  const center: [number, number] | null = origin
    ? [origin.lat, origin.lng]
    : browserCenter;

  const hasOrigin = origin !== null && origin !== undefined;

  /**
   * Ask for a position once, only when there is no saved pin; it centres the view and is never persisted.
   */
  useEffect(() => {
    if (hasOrigin) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoState('unavailable');
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setBrowserCenter([pos.coords.latitude, pos.coords.longitude]);
        setGeoState('granted');
      },
      () => {
        if (!cancelled) setGeoState('denied');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
    return () => {
      cancelled = true;
    };
  }, [hasOrigin]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        worldCopyJump: true,
      }).setView(center ?? WORLD_VIEW[0], center ? 13 : WORLD_VIEW[1]);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    setTimeout(() => map.invalidateSize(true), 100);

    const handleResize = () => mapInstanceRef.current?.invalidateSize(true);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Re-centre once the real position arrives, replacing the world view.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map && center) map.setView(center, 13);
  }, [center]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.invalidateSize(true);

    if (markersLayerRef.current) map.removeLayer(markersLayerRef.current);
    if (circleLayerRef.current) map.removeLayer(circleLayerRef.current);

    // Draw the circle only around a known position, never a guessed coordinate.
    if (center) {
      circleLayerRef.current = L.circle(center, {
        radius: selectedRadiusKm * 1000,
        color: '#cf4a2a',
        fillColor: '#cf4a2a',
        fillOpacity: 0.07,
        weight: 1.5,
        dashArray: '6, 6',
      }).addTo(map);
    }

    const markerGroup = L.layerGroup();
    listings.forEach((listing) => {
      // Listings without coordinates are skipped rather than passed to Leaflet, which
      // throws; the panel reports how many were left out.
      if (listing.lat === undefined || listing.lng === undefined) return;
      const sold = listing.status === 'sold';
      const farther = listing.distanceKm !== undefined && listing.distanceKm > selectedRadiusKm;
      const bg = sold ? '#8a8577' : farther ? '#cf4a2a' : '#1c1a16';
      const label = formatPrice(listing.price);

      const icon = L.divIcon({
        className: 'custom-pulse-marker',
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            <div style="background:${bg};color:#f6f1e7;padding:4px 10px;border-radius:999px;font:700 12px 'DM Sans',sans-serif;box-shadow:0 2px 0 rgba(0,0,0,.25);white-space:nowrap;">
              ${label}
            </div>
            <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${bg};"></div>
          </div>`,
        iconSize: [54, 32],
        iconAnchor: [27, 32],
      });

      const marker = L.marker([listing.lat, listing.lng], { icon });
      marker.on('click', () => onSelectListing(listing));
      markerGroup.addLayer(marker);
    });

    markerGroup.addTo(map);
    markersLayerRef.current = markerGroup;
  }, [listings, selectedRadiusKm, onSelectListing, center]);

  const mappable = listings.filter((l) => l.lat !== undefined && l.lng !== undefined);
  const unmappableCount = listings.length - mappable.length;
  const visibleCount = mappable.filter(
    (l) => l.distanceKm === undefined || l.distanceKm <= selectedRadiusKm,
  ).length;
  const fartherCount = mappable.filter(
    (l) => l.distanceKm !== undefined && l.distanceKm > selectedRadiusKm,
  ).length;
  const inRange = center ? visibleCount : 0;

  return (
    <div className="relative w-full h-full flex flex-col bg-paper">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Left control panel */}
      <aside className="absolute z-10 left-3 top-3 sm:left-5 sm:top-5 w-[min(11.5rem,calc(100%-1.5rem))] sm:w-56 bg-card/95 backdrop-blur border border-line rounded-xl shadow-md sm:shadow-[4px_4px_0_var(--color-line)] p-3 sm:p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Search radius</p>
        <div className="mt-3">
          {/* Mobile: Dropdown */}
          <label className="sm:hidden block">
            <select
              value={selectedRadiusKm}
              onChange={(e) => setSelectedRadiusKm(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-lg border border-line bg-paper text-sm font-semibold text-ink focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 appearance-none cursor-pointer"
            >
              {RADII.map((r) => (
                <option key={r} value={r}>{r} km</option>
              ))}
            </select>
          </label>
          {/* Desktop: Button group */}
          <div className="hidden sm:flex sm:flex-col gap-1.5">
            {RADII.map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRadiusKm(r)}
                className={`h-9 px-3 rounded-lg flex items-center justify-between text-sm font-semibold transition-colors ${
                  selectedRadiusKm === r ? 'bg-ink text-paper' : 'text-ink hover:bg-sand'
                }`}
              >
                <span>{r} km</span>
                {selectedRadiusKm === r && <span className="w-1.5 h-1.5 rounded-full bg-clay" />}
              </button>
            ))}
          </div>
        </div>

        {center ? (
          <div className="mt-4 pt-3 border-t border-line text-xs text-ink-soft space-y-1">
            <p>
              <span className="font-display text-xl font-bold text-ink mr-1">{inRange}</span>
              {inRange === 1 ? 'item' : 'items'} within {selectedRadiusKm} km
            </p>
            {fartherCount > 0 && (
              <p>
                <span className="font-display text-lg font-bold text-clay mr-1">{fartherCount}</span>
                {fartherCount === 1 ? 'item' : 'items'} not within {selectedRadiusKm} km
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 pt-3 border-t border-line text-[11px] leading-snug text-ink-soft">
            <LocateFixed className="w-3.5 h-3.5 inline mb-0.5" aria-hidden="true" />{' '}
            {geoState === 'pending'
              ? 'Waiting for your location…'
              : 'Allow location access to search by distance.'}
          </p>
        )}

        {unmappableCount > 0 && (
          <p className="mt-2 text-[11px] leading-snug text-ink-soft">
            <MapPinOff className="w-3.5 h-3.5 inline mb-0.5" aria-hidden="true" />{' '}
            {unmappableCount} {unmappableCount === 1 ? 'listing has' : 'listings have'} no map
            coordinates yet, so {unmappableCount === 1 ? 'it is' : 'they are'} not pinned. Find{' '}
            {unmappableCount === 1 ? 'it' : 'them'} in the Feed tab.
          </p>
        )}
      </aside>

      {mappable.length > 0 && (
        <div className="absolute z-10 top-5 right-5 hidden lg:flex items-center gap-2 bg-card border border-line rounded-full px-4 py-2 shadow-sm">
          <Navigation className="w-3.5 h-3.5 text-clay" />
          <span className="text-xs font-medium">
            {mappable.length === 1 ? '1 pin' : `${mappable.length} pins`}
            {mappable[0].distanceKm ? ` · nearest ${formatDistance(mappable[0].distanceKm)}` : ''}
          </span>
        </div>
      )}
    </div>
  );
};
