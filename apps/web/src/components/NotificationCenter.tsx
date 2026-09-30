import React, { useEffect, useRef } from 'react';
import { AppNotification } from '../types';
import { X, Bell, CheckCircle2, MessageSquare, Package, AlertCircle } from 'lucide-react';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  theme: 'dark' | 'light';
}

const ICON_MAP: Record<AppNotification['type'], React.ElementType> = {
  message: MessageSquare,
  listing: Package,
  status: CheckCircle2,
  system: AlertCircle,
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      lastFocusedElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      setTimeout(() => modalRef.current?.querySelector('button')?.focus(), 100);
    } else {
      document.body.style.overflow = 'unset';
      lastFocusedElement.current?.focus();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements?.length) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center sm:p-4 bg-ink/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-title"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[94vh] sm:max-h-[90vh] bg-card border border-line rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col animate-scale-in"
      >
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-clay/10 grid place-items-center">
              <Bell className="w-5 h-5 text-clay" aria-hidden="true" />
            </div>
            <div>
              <h2 id="notification-title" className="font-display text-xl font-bold text-ink">Notifications</h2>
              {unreadCount > 0 && (
                <span className="text-xs text-clay font-semibold">{unreadCount} unread</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-xs font-semibold text-clay hover:text-clay-hover transition-colors touch-manipulation focus-ring px-2 py-1 rounded-full hover:bg-clay/10"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-full grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring"
            >
              <X className="w-5 h-5 text-ink" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {notifications.length === 0 ? (
            <div className="py-16 text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-sand grid place-items-center mb-4">
                <Bell className="w-7 h-7 text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-bold text-ink">No notifications</h3>
              <p className="mt-1 text-sm text-ink-soft">You're all caught up!</p>
            </div>
          ) : (
            <ul className="divide-y divide-line" role="list" aria-label="Notifications">
              {notifications.map((notif) => {
                const Icon = ICON_MAP[notif.type];
                return (
                  <li key={notif.id} className={`px-5 py-4 transition-colors ${!notif.read ? 'bg-paper/50' : ''}`}>
                    <button
                      onClick={() => {}}
                      className="w-full text-left flex items-start gap-3 touch-manipulation focus-ring rounded-lg p-1 -m-1"
                    >
                      <div className={`w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 ${!notif.read ? 'bg-clay/10' : 'bg-sand'}`}>
                        <Icon className={`w-4.5 h-4.5 ${!notif.read ? 'text-clay' : 'text-ink-soft'}`} aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={`font-semibold text-sm ${!notif.read ? 'text-ink' : 'text-ink-soft'}`}>{notif.title}</h3>
                          <time className="text-[10px] text-ink-soft shrink-0">{notif.time}</time>
                        </div>
                        <p className="mt-1 text-sm text-ink-soft line-clamp-2">{notif.message}</p>
                      </div>
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full bg-clay flex-shrink-0 mt-1.5" aria-label="Unread" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};