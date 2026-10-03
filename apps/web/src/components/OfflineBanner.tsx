import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-auto z-[var(--z-toast)] animate-slide-up" role="status" aria-live="polite">
      <div className="bg-amber-500/95 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold">
        <WifiOff className="w-4 h-4" aria-hidden="true" />
        <span>Offline Mode - showing cached neighborhood map & items</span>
      </div>
    </div>
  );
};
