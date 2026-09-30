import React from 'react';
import { User } from 'lucide-react';

interface AvatarProps {
  url?: string;
  name?: string;
  className?: string;
}

/** Profile image, or an initial/icon placeholder when there is none.
 * `avatar_url` is nullable, and passing undefined to `src` would give an
 * <img> with no source and a 404 against the page URL. */
export const Avatar: React.FC<AvatarProps> = ({ url, name = '', className = '' }) => {
  const initial = name.trim().charAt(0).toUpperCase();

  if (!url || !url.startsWith('https://')) {
    return (
      <div
        className={`bg-sand text-ink-soft grid place-items-center overflow-hidden ${className}`}
        role="img"
        aria-label={name ? `${name} (no profile photo)` : 'No profile photo'}
      >
        {initial ? (
          <span className="text-[0.7em] font-bold" aria-hidden="true">{initial}</span>
        ) : (
          <User className="w-1/2 h-1/2" strokeWidth={1.5} aria-hidden="true" />
        )}
      </div>
    );
  }

  return <img src={url} alt="" loading="lazy" className={`object-cover ${className}`} />;
};
