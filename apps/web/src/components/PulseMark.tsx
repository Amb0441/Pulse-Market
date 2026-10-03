import React from 'react';

/**
 * Same file as the favicon / PWA icons, so the tab and the header cannot drift.
 */
export const PulseMark: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-9 h-9', title }) => (
  <img
    src="/icons/icon-192x192.svg"
    alt={title ?? ''}
    draggable={false}
    className={className}
  />
);
