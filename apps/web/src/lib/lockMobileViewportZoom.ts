/**
 * Stop iOS Safari from zooming the page when focusing form fields.
 * Font-size ≥ 16px is the primary fix; this re-locks the viewport meta and
 * blocks pinch gestures as a belt-and-suspenders for the PWA shell.
 */
const VIEWPORT_NO_ZOOM =
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

export function lockMobileViewportZoom(): void {
  if (typeof document === 'undefined') return;

  const apply = () => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    if (meta.getAttribute('content') !== VIEWPORT_NO_ZOOM) {
      meta.setAttribute('content', VIEWPORT_NO_ZOOM);
    }
  };

  apply();

  const blockGesture = (event: Event) => {
    event.preventDefault();
  };
  document.addEventListener('gesturestart', blockGesture, { passive: false });
  document.addEventListener('gesturechange', blockGesture, { passive: false });
  document.addEventListener('gestureend', blockGesture, { passive: false });

  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.tagName) return;
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        apply();
        // If something already scaled the visual viewport, snap back.
        if (window.visualViewport && window.visualViewport.scale > 1.01) {
          apply();
          window.scrollTo(0, 0);
        }
      }
    },
    true,
  );
}
