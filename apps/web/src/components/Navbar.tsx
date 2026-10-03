import React from 'react';
import { Map, Grid, MessageSquare, User as UserIcon, Plus, Bell, LogOut, MapPin, ChevronDown, Activity } from 'lucide-react';
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
      <div className="shrink-0 z-[calc(var(--z-sticky)+1)] w-full bg-clay/10 border-b border-clay/20 px-4 py-2 text-center text-xs font-medium text-clay safe-top">
        <MapPin className="w-3 h-3 inline-block mr-1.5 text-clay" aria-hidden="true" />
        <span className="hidden sm:inline">Your location is private — listings show an area, never your exact address</span>
        <span className="sm:hidden">Your exact address stays private</span>
      </div>

      <header className="shrink-0 z-[var(--z-sticky)] w-full bg-paper/95 backdrop-blur border-b border-line transition-smooth">
        <div className="max-w-7xl mx-auto h-14 sm:h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Wordmark and area line are sibling buttons: nesting <button> in
              <button> is invalid HTML, and the area click would also navigate. */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('feed')}
              className="flex-shrink-0 text-left group touch-manipulation"
              aria-label="Pulse home"
            >
              <Activity className="w-8 h-8 text-clay group-hover:text-clay-hover transition-colors" aria-hidden="true" />
            </button>

            <div className="hidden sm:flex flex-col items-start leading-none">
              <button
                onClick={() => setActiveTab('feed')}
                className="font-display text-xl sm:text-2xl font-bold text-ink hover:text-clay transition-colors focus-ring rounded-sm touch-manipulation"
              >
                Pulse
              </button>
              <button
                type="button"
                onClick={onEditLocation}
                className="mt-1 flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-clay transition-colors focus-ring rounded-sm touch-manipulation"
                aria-label={`Your area: ${locationText}. Change your location`}
              >
                <MapPin className="w-3 h-3 text-clay flex-shrink-0" aria-hidden="true" />
                <span className="truncate max-w-[140px]">{locationText}</span>
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
                  <span className="hidden sm:inline">{label}</span>
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

          <div className="flex items-center gap-1.5 lg:gap-2">
            <button
              onClick={onOpenNotifications}
              title="Notifications"
              className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full grid place-items-center text-ink hover:bg-sand transition-colors touch-manipulation focus-ring"
              aria-label={`Notifications${unreadNotificationsCount > 0 ? `, ${unreadNotificationsCount} unread` : ''}`}
            >
              <Bell className="w-[18px] h-[18px] sm:w-5 sm:h-5" aria-hidden="true" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-clay ring-2 ring-paper animate-pulse-soft" aria-hidden="true" />
              )}
            </button>

            <button
              onClick={onOpenSellModal}
              className="hidden sm:flex items-center gap-1.5 h-10 sm:h-11 pl-4 pr-5 rounded-full bg-clay hover:bg-clay-hover text-white text-sm font-semibold transition-colors touch-manipulation focus-ring active:scale-[0.98]"
              aria-label="Create new listing"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Sell</span>
            </button>

            <button
              onClick={onSignOut}
              title="Sign out"
              className="w-10 h-10 rounded-full grid place-items-center text-ink-soft hover:text-clay hover:bg-sand transition-colors touch-manipulation focus-ring"
              aria-label="Sign out"
            >
              <LogOut className="w-[18px] h-[18px] sm:w-5 sm:h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-[var(--z-sticky)] bg-card/95 backdrop-blur border-t border-line safe-bottom"
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-5 items-end px-1 pt-1.5 pb-1.5">
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
            className="justify-self-center -mt-4 w-14 h-14 rounded-full bg-clay text-white grid place-items-center ring-4 ring-card shadow-lg active:scale-95 transition-transform touch-manipulation focus-ring"
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
    className={`relative flex flex-col items-center gap-1 py-1.5 transition-colors touch-manipulation ${
      active ? 'text-clay' : 'text-ink-soft'
    } focus-ring rounded-full`}
    aria-current={active ? 'page' : undefined}
    aria-label={active ? `${label}, current tab` : label}
  >
    <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : 'stroke-2'}`} aria-hidden="true" />
    <span className="text-[10px] font-semibold">{label}</span>
    {count > 0 && (
      <span className="absolute top-0 right-2 min-w-4 h-4 px-1 rounded-full bg-clay text-white text-[9px] font-bold grid place-items-center animate-scale-in" aria-label={`${count} unread`}>
        {count > 9 ? '9+' : count}
      </span>
    )}
  </button>
);