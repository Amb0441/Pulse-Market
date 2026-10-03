import React, { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Loader2, Crosshair } from 'lucide-react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PH_CENTER, isInPhilippines, describeArea, type LatLng } from '../lib/geo';

interface LocationPickerProps {
  value: LatLng | null;
  onChange: (value: LatLng | null) => void;
  /** Shown under the map; defaults to instructions. */
  hint?: string;
  /** Allow picking a point outside the Philippines (still allowed, just warned). */
  allowOutside?: boolean;
  className?: string;
}

type GeoState = 'idle' | 'locating' | 'found' | 'denied' | 'unavailable';

/** Map with a draggable pin; clicking it or "My location" sets the value.
 * Leaflet is bundled locally rather than loaded from a CDN, so no third-party
 * script is needed in the page's CSP. */
export const LocationPicker: React.FC<LocationPickerProps> = ({
  value,
  onChange,
  hint = 'Tap the map to place your pin, or use your current location.',
  allowOutside = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [outside, setOutside] = useState(false);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Construction can still fail, and this sits on a required field: say what
    // happened instead of showing "Loading map…" forever.
    let map: ReturnType<typeof L.map>;
    try {
      map = L.map(containerRef.current, { zoomControl: false, worldCopyJump: false })
        .setView([value?.lat ?? PH_CENTER.lat, value?.lng ?? PH_CENTER.lng], value ? 13 : 5);
    } catch (err) {
      console.error('Leaflet could not start the location map', err);
      setMapFailed(true);
      return;
    }

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;

    const pinIcon = L.divIcon({
      className: '',
      html: '<span style="display:block;width:18px;height:18px;border-radius:50% 50% 50% 0;background:#cf4a2a;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 18],
    });

    const place = (latlng: LatLng) => {
      if (markerRef.current) {
        markerRef.current.setLatLng([latlng.lat, latlng.lng]);
      } else {
        markerRef.current = L.marker([latlng.lat, latlng.lng], {
          draggable: true,
          icon: pinIcon,
        }).addTo(map);
        // Draggable so the pin can be nudged off a building or a road.
        markerRef.current.on('dragend', () => {
          const p = markerRef.current.getLatLng();
          apply({ lat: p.lat, lng: p.lng });
        });
      }
    };

    const apply = (next: LatLng) => {
      setOutside(!allowOutside && !isInPhilippines(next));
      onChange(next);
    };

    map.on('click', (e: any) => {
      const next = { lat: e.latlng.lat, lng: e.latlng.lng };
      place(next);
      apply(next);
    });

    // Store on the map instance so the "my location" button can reuse it.
    (map as any).__place = place;

    if (value) place(value);

    const resize = () => {
      map.invalidateSize(true);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(containerRef.current);
    const t0 = window.setTimeout(resize, 0);
    const t1 = window.setTimeout(resize, 150);
    const t2 = window.setTimeout(resize, 400);
    setReady(true);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Mount-only: the map is created once and then driven imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move the map when a parent supplies an initial point after mount.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value || !ready) return;
    (map as any).__place?.(value);
    map.setView([value.lat, value.lng], Math.max(map.getZoom(), 13));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng, ready]);

  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoState('unavailable');
      return;
    }
    setGeoState('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const map = mapRef.current;
        (map as any).__place?.(next);
        map?.setView([next.lat, next.lng], 13);
        setOutside(!allowOutside && !isInPhilippines(next));
        onChange(next);
        setGeoState('found');
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <div className={className}>
      <div className="relative rounded-lg overflow-hidden border border-line bg-paper">
        <div ref={containerRef} className="w-full h-56 cursor-crosshair" role="application"
          aria-label="Map. Click to place your location pin." />

        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoState === 'locating'}
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/95 border border-line text-xs font-semibold text-ink shadow-sm hover:bg-card disabled:opacity-60 transition-colors"
        >
          {geoState === 'locating' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          My location
        </button>

        {!ready && !mapFailed && (
          <div className="absolute inset-0 grid place-items-center bg-paper/70 text-xs text-ink-soft">
            Loading map…
          </div>
        )}

        {mapFailed && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center bg-paper/90">
            <p className="text-xs text-ink-soft max-w-[22rem]">
              The map could not load, so there is nothing to tap.
              <span className="block mt-1 font-medium text-ink">
                Use &ldquo;My location&rdquo; to set your pin from this device instead.
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-ink-soft">
        {value ? (
          <>
            <MapPin className="w-3.5 h-3.5 mt-px shrink-0 text-clay" aria-hidden="true" />
            <span>
              Pin placed at {describeArea(value)}. Drag it to adjust.
            </span>
          </>
        ) : (
          <>
            <Crosshair className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
            <span>{hint}</span>
          </>
        )}
      </div>

      {outside && (
        <p className="mt-1 text-[11px] font-medium text-rose" role="alert">
          That point is outside the Philippines. Please pick a spot inside the country.
        </p>
      )}

      {geoState === 'denied' && (
        <p className="mt-1 text-[11px] font-medium text-ink-soft">
          Location access was blocked. Tap the map to place your pin instead.
        </p>
      )}
    </div>
  );
};
