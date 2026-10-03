import React from 'react';
import { Map, Grid, MessageSquare, User as UserIcon, Plus, Bell, LogOut, MapPin, Activity } from 'lucide-react';
import { UserProfile } from '../types';
import { describeArea } from '../lib/geo';

type Tab = 'map' | 'feed' | 'chats' | 'dashboard';

interface NavbarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  user: UserProfile;
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  onOpenSellModal: () => void;
  onOpenNotifications: () => void;
  onSignOut: () => void;
  /** Open the map so the member can set or move their own pin. */
  onEditLocation: () => void;
  theme: 'light';
}

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'feed', label: 'Feed', Icon: Grid },
  { id: 'map', label: 'Map', Icon: Map },
  { id: 'chats', label: 'Chats', Icon: MessageSquare },
  { id: 'dashboard', label: 'Profile', Icon: UserIcon },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  user,
  unreadMessagesCount,
  unreadNotificationsCount,
  onOpenSellModal,
  onOpenNotifications,
  onSignOut,
  onEditLocation,
}) => {
  const badge = (tab: Tab) => (tab === 'chats' ? unreadMessagesCount : 0);

  /** Line under the logo: typed area name, then coordinates via `describeArea`,
   * then a prompt to set one - never blank, never an invented place name. */
  const locationText =
    user.neighborhood?.trim() ||
    (user.lat !== undefined && user.lng !== undefined ? describeArea({ lat: user.lat, lng: user.lng }) : '') ||
    'Set your location';

  return (
    <>
      {/* Desktop-only privacy strip — on phones it reads as website chrome. */}
      <div className="hidden lg:block shrink-0 z-[calc(var(--z-sticky)+1)] w-full bg-clay/10 border-b border-clay/20 px-4 py-2 text-center text-xs font-medium text-clay">
        <MapPin className="w-3 h-3 inline-block mr-1.5 text-clay" aria-hidden="true" />
        Your location is private — listings show an area, never your exact address
      </div>

      {/* Single continuous top bar: safe-area + brand + actions (native app chrome).
          Opaque paper — backdrop-blur frosted the mark under the iOS status bar in standalone. */}
      <header className="shrink-0 z-[var(--z-sticky)] w-full bg-paper border-b border-line transition-smooth safe-top">
        <div className="max-w-7xl mx-auto h-14 lg:h-16 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          {/* Wordmark and area line are sibling buttons: nesting <button> in
              <button> is invalid HTML, and the area click would also navigate. */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setActiveTab('feed')}
              className="flex-shrink-0 text-left group touch-manipulation"
              aria-label="Pulse home"
            >
              <Activity className="w-7 h-7 sm:w-8 sm:h-8 text-clay group-hover:text-clay-hover transition-colors" aria-hidden="true" />
            </button>

            <div className="flex flex-col items-start leading-none min-w-0">
              <button
                onClick={() => setActiveTab('feed')}
                className="font-display text-lg sm:text-xl lg:text-2xl font-bold text-ink hover:text-clay transition-colors focus-ring rounded-sm touch-manipulation"
              >
                Pulse
              </button>
              <button
                type="button"
                onClick={onEditLocation}
                className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-clay transition-colors focus-ring rounded-sm touch-manipulation max-w-[160px] sm:max-w-[200px]"
                aria-label={`Your area: ${locationText}. Change your location`}
              >
                <MapPin className="w-3 h-3 text-clay flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{locationText}</span>
              </button>
            </div>
          </div>

          <nav className="hidden lg:flex items-stretch h-full gap-1" role="navigation" aria-label="Main navigation">
            {TABS.map(({ id, label, Icon }) => {
              const active = activeTab === id;
              const count = badge(id);
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`relative px-4 py-2.5 flex items-center gap-2 text-sm font-semibold transition-smooth ${
                    active ? 'text-ink' : 'text-ink-soft hover:text-ink'
                  } focus-ring rounded-full`}
                  aria-current={active ? 'page' : undefined}
                  aria-label={active ? `${label}, current tab` : label}
                >
                  <Icon className={`w-4 h-4 ${active ? 'stroke-[2.5]' : 'stroke-2'}`} aria-hidden="true" />
                  <span>{label}</span>
                  {count > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-clay text-white text-[10px] font-bold grid place-items-center animate-scale-in" aria-label={`${count} unread messages`}>
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                  <span
                    className={`absolute left-4 right-4 bottom-0 h-0.5 bg-clay transition-transform origin-center ${
                      active ? 'scale-x-100' : 'scale-x-0'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onOpenNotifications}
              title="Notifications"
              className="relative w-11 h-11 rounded-full grid place-items-center text-ink hover:bg-sand transition-colors touch-manipulation focus-ring"
              aria-label={`Notifications${unreadNotificationsCount > 0 ? `, ${unreadNotificationsCount} unread` : ''}`}
            >
              <Bell className="w-5 h-5" aria-hidden="true" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-clay ring-2 ring-paper animate-pulse-soft" aria-hidden="true" />
              )}
            </button>

            <button
              onClick={onOpenSellModal}
              className="hidden sm:flex items-center gap-1.5 h-11 pl-4 pr-5 rounded-full bg-clay hover:bg-clay-hover text-white text-sm font-semibold transition-colors touch-manipulation focus-ring active:scale-[0.98]"
              aria-label="Create new listing"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Sell</span>
            </button>

            {/* Sign-out lives on Profile for phones; keep it here on large screens. */}
            <button
              onClick={onSignOut}
              title="Sign out"
              className="hidden lg:grid w-11 h-11 rounded-full place-items-center text-ink-soft hover:text-clay hover:bg-sand transition-colors touch-manipulation focus-ring"
              aria-label="Sign out"
            >
              <LogOut className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <nav
        className="mobile-tabbar lg:hidden"
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="mobile-tabbar-inner grid grid-cols-5 items-end px-1 pb-1">
          {[TABS[0], TABS[1]].map(({ id, label, Icon }) => (
            <MobileTab
              key={id}
              active={activeTab === id}
              onClick={() => setActiveTab(id)}
              label={label}
              Icon={Icon}
            />
          ))}

          <button
            onClick={onOpenSellModal}
            aria-label="Sell an item"
            className="justify-self-center -mt-5 w-14 h-14 rounded-full bg-clay text-white grid place-items-center ring-4 ring-card shadow-lg active:scale-95 transition-transform touch-manipulation focus-ring"
          >
            <Plus className="w-7 h-7" strokeWidth={2.5} aria-hidden="true" />
          </button>

          {[TABS[2], TABS[3]].map(({ id, label, Icon }) => (
            <MobileTab
              key={id}
              active={activeTab === id}
              onClick={() => setActiveTab(id)}
              label={label}
              Icon={Icon}
              count={badge(id)}
            />
          ))}
        </div>
      </nav>
    </>
  );
};

const MobileTab: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  Icon: React.ElementType;
  count?: number;
}> = ({ active, onClick, label, Icon, count = 0 }) => (
  <button
    onClick={onClick}
    className={`relative flex flex-col items-center justify-center gap-0.5 min-h-12 py-1 transition-colors touch-manipulation ${
      active ? 'text-clay' : 'text-ink-soft'
    } focus-ring rounded-xl`}
    aria-current={active ? 'page' : undefined}
    aria-label={active ? `${label}, current tab` : label}
  >
    <Icon className={`w-6 h-6 ${active ? 'stroke-[2.5]' : 'stroke-2'}`} aria-hidden="true" />
    <span className="text-[10px] font-semibold leading-none">{label}</span>
    {count > 0 && (
      <span className="absolute top-0.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-clay text-white text-[9px] font-bold grid place-items-center animate-scale-in" aria-label={`${count} unread`}>
        {count > 9 ? '9+' : count}
      </span>
    )}
  </button>
);
