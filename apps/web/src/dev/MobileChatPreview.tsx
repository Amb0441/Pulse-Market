import React, { useState } from 'react';
import { ChatHub } from '../components/ChatHub';
import type { ChatThread, ItemStatus } from '../types';

/**
 * Dev-only fixture so we can verify the mobile chat shell without a live API.
 * Loaded from main.tsx when the URL contains `?demo=mobile-chat`.
 */
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
    unreadCount: 0,
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

export const MobileChatPreview: React.FC = () => {
  const [chats, setChats] = useState(DEMO_CHATS);

  return (
    <div className="app-height overflow-hidden flex flex-col bg-paper">
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
                    lastMessageTime: 'now',
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
        onMarkRead={() => undefined}
        onUpdateListingStatus={(listingId, status: ItemStatus) => {
          setChats((prev) =>
            prev.map((c) => (c.listingId === listingId ? { ...c, listingStatus: status } : c)),
          );
        }}
        onOpenReviewModal={() => undefined}
        openListingId="listing-1"
        theme="light"
      />
    </div>
  );
};
