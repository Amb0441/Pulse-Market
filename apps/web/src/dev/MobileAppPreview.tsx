import React, { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { ChatHub } from '../components/ChatHub';
import type { ChatThread, ItemStatus, UserProfile } from '../types';
import { PackageOpen } from 'lucide-react';

/**
 * Dev-only full mobile app shell so phone-viewport chrome can be checked
 * without signing in. Open with `?demo=mobile-app`.
 */
const DEMO_USER: UserProfile = {
  id: 'me',
  name: 'Demo Neighbor',
  email: 'demo@pulse.local',
  avatar: '',
  neighborhood: 'Maple & 3rd',
  joinedDate: '2025-01-01',
  lat: 14.6,
  lng: 121.0,
};

const DEMO_CHATS: ChatThread[] = [
  {
    id: 'demo-1',
    listingId: 'listing-1',
    listingTitle: 'test5',
    listingImage: '',
    listingPrice: 7000,
    listingStatus: 'active',
    buyerId: 'buyer-1',
    buyerName: 'Alex',
    sellerId: 'me',
    sellerName: 'You',
    lastMessage: 'hello',
    lastMessageTime: 'now',
    unreadCount: 1,
    messages: [
      {
        id: 'm1',
        chatId: 'demo-1',
        senderId: 'buyer-1',
        senderName: 'Alex',
        text: 'hello',
        timestamp: '4:28 PM',
      },
    ],
  },
];

type Tab = 'map' | 'feed' | 'chats' | 'dashboard';

export const MobileAppPreview: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [chats, setChats] = useState(DEMO_CHATS);

  return (
    <div className="app-height overflow-hidden flex flex-col bg-paper overscroll-none">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={DEMO_USER}
        unreadMessagesCount={chats.reduce((n, c) => n + c.unreadCount, 0)}
        unreadNotificationsCount={2}
        onOpenSellModal={() => undefined}
        onOpenNotifications={() => undefined}
        onSignOut={() => undefined}
        onEditLocation={() => undefined}
        theme="light"
      />

      <main className="flex-1 min-h-0 relative overflow-hidden pb-[var(--mobile-nav-height)] lg:pb-0 mobile-scene">
        <div className={activeTab === 'feed' ? 'h-full overflow-y-auto no-scrollbar overscroll-none' : 'hidden'}>
          <div className="px-4 pt-4 pb-6">
            <h1 className="font-display text-2xl font-bold text-ink">Around you</h1>
            <p className="mt-1 text-sm text-ink-soft">3 items within 3 km</p>
            <div className="mt-5 space-y-3">
              {['Vintage desk lamp', 'Kids bike', 'Garden tools'].map((title) => (
                <article key={title} className="bg-card border border-line rounded-2xl p-4 flex gap-3">
                  <div className="w-20 h-20 rounded-xl bg-sand shrink-0" />
                  <div className="min-w-0">
                    <h2 className="font-semibold text-sm text-ink truncate">{title}</h2>
                    <p className="text-sm font-bold text-ink mt-1">₱1,200</p>
                    <p className="text-xs text-ink-soft mt-1">0.4 km · Active</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className={activeTab === 'map' ? 'h-full min-h-0 grid place-items-center bg-sand' : 'hidden'}>
          <p className="text-sm text-ink-soft">Map scene fills the viewport between chrome.</p>
        </div>

        <div className={activeTab === 'chats' ? 'h-full min-h-0' : 'hidden'}>
          <ChatHub
            chats={chats}
            currentUserId="me"
            onSendMessage={(chatId, text) => {
              setChats((prev) =>
                prev.map((c) =>
                  c.id !== chatId
                    ? c
                    : {
                        ...c,
                        lastMessage: text,
                        unreadCount: 0,
                        messages: [
                          ...c.messages,
                          {
                            id: `m-${Date.now()}`,
                            chatId,
                            senderId: 'me',
                            senderName: 'You',
                            text,
                            timestamp: 'now',
                          },
                        ],
                      },
                ),
              );
            }}
            onMarkRead={(id) => {
              setChats((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
            }}
            onUpdateListingStatus={(listingId, status: ItemStatus) => {
              setChats((prev) =>
                prev.map((c) => (c.listingId === listingId ? { ...c, listingStatus: status } : c)),
              );
            }}
            onOpenReviewModal={() => undefined}
            theme="light"
          />
        </div>

        <div className={activeTab === 'dashboard' ? 'h-full overflow-y-auto no-scrollbar overscroll-none' : 'hidden'}>
          <div className="px-4 pt-4 pb-6">
            <div className="bg-card rounded-2xl p-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-sand grid place-items-center font-display text-2xl font-bold text-ink-soft">
                D
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-ink">{DEMO_USER.name}</h1>
                <p className="text-sm text-ink-soft">{DEMO_USER.neighborhood}</p>
              </div>
            </div>
            <div className="mt-6 py-10 text-center">
              <PackageOpen className="w-8 h-8 mx-auto text-ink-soft" aria-hidden="true" />
              <p className="mt-2 text-sm text-ink-soft">Profile scene — sign out lives here on mobile.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
