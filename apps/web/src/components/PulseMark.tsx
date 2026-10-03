import React from 'react';

/**
 * Product mark: clay tile + heartbeat. Used in the header, landing, and as the
 * source for the PWA icons so the on-screen logo and the home-screen icon match.
 */
export const PulseMark: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-9 h-9', title }) => (
  <svg
    viewBox="0 0 32 32"
    className={className}
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    focusable="false"
  >
    {title ? <title>{title}</title> : null}
    <rect width="32" height="32" rx="9" className="fill-clay group-hover:fill-clay-hover transition-colors" />
    <path
      d="M4 16h6.2l1.6-6.5 2.4 13 2.6-9.2 1.4 2.7H28"
      fill="none"
      stroke="#fffdf8"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
