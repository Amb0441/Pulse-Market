import React, { useEffect, useRef, useState } from 'react';
import { ChatThread, ItemStatus } from '../types';
import { MessageSquare, Send, Star, ArrowLeft, MoreVertical, ExternalLink, Link2, CheckCheck } from 'lucide-react';
import { formatPrice } from '../lib/format';
import { listingUrl, shareListing, shareText } from '../lib/share';
import { notifySuccess, notifyError } from '../stores/useToasts';
import { ListingImage } from './ListingImage';

interface ChatHubProps {
  chats: ChatThread[];
  /** The signed-in user's real id, used to decide which messages are "mine". */
  currentUserId: string;
  onSendMessage: (chatId: string, text: string) => void;
  /**
   * Clears the server-side unread badge for a thread; the count lives in the database.
   */
  onMarkRead: (chatId: string) => void;
  /**
   * Reserve / Mark sold for this thread's listing; rendered only for the item's seller.
   */
  onUpdateListingStatus: (listingId: string, status: ItemStatus) => void;
  onOpenReviewModal: (chat: ChatThread) => void;
  /**
   * Opens the listing this thread is about, resolved through the API rather than chat data.
   */
  onViewListing?: (listingId: string) => void;
  /**
   * Listing whose conversation was just started, so the hub selects that thread.
   */
  openListingId?: string | null;
  /** Called once that thread is on screen, so the parent can clear `openListingId`. */
  onChatOpened?: () => void;
  theme: 'dark' | 'light';
}

/** A chat stores a single image URL, which is '' when the listing had no photo. */
const chatImages = (url: string): string[] => (url ? [url] : []);

export const ChatHub: React.FC<ChatHubProps> = ({
  chats,
  currentUserId,
  onSendMessage,
  onMarkRead,
  onUpdateListingStatus,
  onOpenReviewModal,
  onViewListing,
  openListingId,
  onChatOpened,
}) => {
  const [activeChatId, setActiveChatId] = useState<string>(chats[0]?.id || '');
  const [inputText, setInputText] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showThreadMenu, setShowThreadMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];

  // `chats` is empty on first paint, so the initial state captured no id.
  // Adopt the newest thread once it lands; a lazy initializer would not re-run.
  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [activeChatId, chats]);

  // Jump to a conversation the user just started. Keyed on the listing id, which
  // is stable, rather than on the callback, which is re-created every render.
  useEffect(() => {
    if (!openListingId) return;
    const thread = chats.find((c) => c.listingId === openListingId);
    if (!thread) return;
    setActiveChatId(thread.id);
    setMobileChatOpen(true);
    onChatOpened?.();
  }, [openListingId, chats, onChatOpened]);

  // Opening a thread marks it read on the server so the badge survives a refresh.
  // Keyed on thread id and unread count, not on `chats`, which changes identity per fetch.
  const activeUnread = activeChat?.unreadCount ?? 0;
  useEffect(() => {
    if (activeChat) onMarkRead(activeChat.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, activeUnread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages.length, activeChatId, mobileChatOpen]);

  // A menu belongs to one thread. Left open across a selection change it would
  // offer the previous conversation's actions against the next one.
  useEffect(() => {
    setShowThreadMenu(false);
  }, [activeChatId]);

  /**
   * Prompt for a review when a deal closes while the buyer is reading; only on an edge into `sold`.
   */
  const activeStatus = activeChat?.listingStatus;
  const previousStatus = useRef<{ id: string; status: ItemStatus | undefined } | null>(null);
  useEffect(() => {
    const status = activeStatus;
    const before = previousStatus.current;
    previousStatus.current = { id: activeChatId, status };
    if (status !== 'sold' || !activeChat) return;
    // No edge within this thread: unchanged, already sold, or carried over from
    // the thread just left, which is a switch rather than a change.
    if (!before || before.id !== activeChatId || before.status === undefined || before.status === 'sold') {
      return;
    }
    onOpenReviewModal(activeChat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, activeStatus]);

  const handleViewListing = () => {
    setShowThreadMenu(false);
    if (activeChat) onViewListing?.(activeChat.listingId);
  };

  const handleMarkRead = () => {
    setShowThreadMenu(false);
    if (activeChat) onMarkRead(activeChat.id);
  };

  const handleCopyListingLink = async () => {
    setShowThreadMenu(false);
    if (!activeChat) return;
    const url = listingUrl(activeChat.listingId);
    const text = shareText(activeChat.listingTitle, formatPrice(activeChat.listingPrice));
    const result = await shareListing(url, text);
    if (result === 'copied') notifySuccess('Listing link copied to your clipboard.');
    // 'shared' means the OS sheet already confirmed it to the user, so no
    // separate success toast is shown for that result.
    if (result === 'failed') notifyError('We could not copy the link.');
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChat) return;
    onSendMessage(activeChat.id, inputText.trim());
    setInputText('');
  };

  const handleStatusChange = (s: ItemStatus) => {
    if (activeChat) {
      onUpdateListingStatus(activeChat.listingId, s);
      setShowStatusMenu(false);
    }
  };

  if (!chats.length) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-sand grid place-items-center mb-4">
          <MessageSquare className="w-8 h-8 text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h3 className="font-display text-xl font-bold text-ink">No conversations yet</h3>
        <p className="mt-1 text-sm text-ink-soft">Message a neighbor from the feed or map to get started.</p>
      </div>
    );
  }

  // Reserve / Mark sold / Review for this thread's listing. Reserve and Sold
  // render only for the seller; Review for either side once the deal is sold.
  const StatusActions = ({ compact = false }: { compact?: boolean }) => {
    const btn = compact ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-xs';
    const isSeller = activeChat.sellerId === currentUserId;
    return (
      <div className="flex items-center gap-2 shrink-0">
        {isSeller && activeChat.listingStatus === 'active' && (
          <button
            onClick={() => handleStatusChange('reserved')}
            className={`${btn} rounded-full border border-ink font-semibold hover:bg-mustard hover:border-mustard hover:text-white transition-colors touch-manipulation focus-ring`}
          >
            Reserve
          </button>
        )}
        {isSeller && activeChat.listingStatus !== 'sold' && (
          <button
            onClick={() => handleStatusChange('sold')}
            className={`${btn} rounded-full bg-moss text-white font-semibold hover:opacity-90 transition-opacity touch-manipulation focus-ring`}
          >
            {compact ? 'Sold' : 'Mark sold'}
          </button>
        )}
        {activeChat.listingStatus === 'sold' && !activeChat.reviewCompleted && (
          <button
            onClick={() => {
              onOpenReviewModal(activeChat);
              setMobileChatOpen(false);
            }}
            className={`${btn} rounded-full bg-clay text-white font-semibold flex items-center gap-1.5 touch-manipulation focus-ring`}
          >
            <Star className="w-3 h-3 fill-current" aria-hidden="true" />
            Review
          </button>
        )}
      </div>
    );
  };

  const Messages = ({ maxW }: { maxW: string }) => (
    <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-5 space-y-3" role="log" aria-live="polite" aria-label="Messages">
      {activeChat.messages.map((msg) => {
        const isMe = msg.senderId === currentUserId;
        if (msg.isSystemAction) {
          return (
            <div key={msg.id} className="flex justify-center py-1 animate-fade-in">
              <span className="px-3.5 py-1 rounded-full bg-sand text-[11px] font-medium text-ink-soft">
                {msg.text} · {msg.timestamp}
              </span>
            </div>
          );
        }
        return (
          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-rise`} style={{ animationDelay: '50ms' }}>
            <div
              className={`${maxW} px-4 py-2.5 text-sm leading-relaxed ${
                isMe
                  ? 'bg-ink text-paper rounded-2xl rounded-br-sm shadow-sm'
                  : 'bg-card border border-line rounded-2xl rounded-bl-sm'
              }`}
            >
              {msg.text}
            </div>
            <span className="mt-1 px-1 text-[10px] text-ink-soft">
              {isMe ? 'You' : msg.senderName} · {msg.timestamp}
            </span>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );

  const Composer = ({ className = '' }: { className?: string }) => (
    <form onSubmit={handleSend} className={`px-4 py-3 border-t border-line bg-paper flex items-center gap-2 ${className}`}>
      <input
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Write a message..."
        className="flex-1 h-11 px-4 rounded-full border border-line bg-card text-sm placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 transition-smooth"
        aria-label="Message"
      />
      <button
        type="submit"
        disabled={!inputText.trim()}
        aria-label="Send message"
        className="w-11 h-11 rounded-full bg-clay hover:bg-clay-hover disabled:bg-line disabled:cursor-not-allowed text-white grid place-items-center transition-colors touch-manipulation focus-ring active:scale-95"
      >
        <Send className="w-4 h-4" aria-hidden="true" />
      </button>
    </form>
  );

  const ChatHeader = ({ back = false }: { back?: boolean }) => (
    <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3 bg-paper sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        {back && (
          <button
            onClick={() => setMobileChatOpen(false)}
            aria-label="Back to conversations"
            className="w-9 h-9 -ml-1 rounded-full grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
        <ListingImage
          images={chatImages(activeChat.listingImage)}
          alt=""
          className="w-10 h-10 rounded-lg shrink-0"
        />
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate text-ink">{activeChat.listingTitle}</div>
          <div className="text-xs text-ink-soft flex items-center gap-1.5">
            <span className="font-semibold text-ink">{formatPrice(activeChat.listingPrice)}</span>
            <span className="uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded-full bg-clay/10 text-clay">
              {activeChat.listingStatus}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {StatusActions({ compact: back })}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowThreadMenu((v) => !v)}
            className="w-9 h-9 rounded-full grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring"
            aria-label="Conversation options"
            aria-haspopup="menu"
            aria-expanded={showThreadMenu}
          >
            <MoreVertical className="w-5 h-5" aria-hidden="true" />
          </button>

          {showThreadMenu && (
            <>
              {/* Click-away layer; Escape alone is not discoverable on touch screens. */}
              <div className="fixed inset-0 z-10" onClick={() => setShowThreadMenu(false)} aria-hidden="true" />
              <div
                role="menu"
                aria-label="Conversation options"
                className="absolute right-0 top-full mt-1 z-20 w-52 py-1 rounded-xl border border-line bg-card shadow-lg animate-scale-in origin-top-right"
              >
                {onViewListing && (
                  <button
                    role="menuitem"
                    onClick={handleViewListing}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink hover:bg-sand transition-colors touch-manipulation text-left"
                  >
                    <ExternalLink className="w-4 h-4 text-ink-soft shrink-0" aria-hidden="true" />
                    View listing
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => { void handleCopyListingLink(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink hover:bg-sand transition-colors touch-manipulation text-left"
                >
                  <Link2 className="w-4 h-4 text-ink-soft shrink-0" aria-hidden="true" />
                  Copy listing link
                </button>
                <button
                  role="menuitem"
                  onClick={handleMarkRead}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink hover:bg-sand transition-colors touch-manipulation text-left"
                >
                  <CheckCheck className="w-4 h-4 text-ink-soft shrink-0" aria-hidden="true" />
                  Mark as read
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 sm:py-6 h-full min-h-0">
      <div className="h-full sm:border border-line sm:rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 bg-card">
        <div className="md:col-span-4 md:border-r border-line flex flex-col h-full min-h-0">
          <div className="px-5 py-5 border-b border-line">
            <h2 className="font-display text-2xl font-bold text-ink">Messages</h2>
          </div>
          <ul className="flex-1 overflow-y-auto no-scrollbar" role="list" aria-label="Conversations">
            {chats.map((chat) => {
              const active = activeChatId === chat.id;
              // The other party is whichever side is not the signed-in user, so each
              // conversation shows the opposite side's name.
              const other = chat.sellerId === currentUserId ? chat.buyerName : chat.sellerName;
              return (
                <li key={chat.id}>
                  <button
                    onClick={() => {
                      setActiveChatId(chat.id);
                      setMobileChatOpen(true);
                    }}
                    className={`w-full text-left px-5 py-4 flex items-center gap-3 border-b border-line/60 transition-colors touch-manipulation ${
                      active ? 'md:bg-sand' : 'hover:bg-paper'
                    }`}
                    aria-current={active ? 'true' : 'false'}
                  >
                    <ListingImage
                      images={chatImages(chat.listingImage)}
                      alt=""
                      className="w-12 h-12 rounded-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`text-sm truncate ${chat.unreadCount ? 'font-bold' : 'font-semibold'} text-ink`}>{other}</span>
                        <span className="text-[10px] text-ink-soft shrink-0">{chat.lastMessageTime}</span>
                      </div>
                      <div className="text-xs font-medium text-clay truncate">{chat.listingTitle}</div>
                      <p className={`text-xs truncate mt-0.5 ${chat.unreadCount ? 'text-ink' : 'text-ink-soft'}`}>{chat.lastMessage}</p>
                    </div>
                    {chat.unreadCount > 0 && (
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-clay text-white text-[10px] font-bold grid place-items-center animate-scale-in" aria-label={`${chat.unreadCount} unread messages`}>
                        {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="hidden md:flex md:col-span-8 flex-col h-full min-h-0">
          {activeChat && (
            <>
              {ChatHeader({})}
              {Messages({ maxW: 'max-w-md' })}
              {Composer({})}
            </>
          )}
        </div>
      </div>

      {mobileChatOpen && activeChat && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex flex-col md:hidden bg-paper animate-slide-up" role="dialog" aria-modal="true" aria-labelledby="mobile-chat-title">
          {ChatHeader({ back: true })}
          {Messages({ maxW: 'max-w-[85%]' })}
          {Composer({ className: 'pb-6 safe-bottom' })}
        </div>
      )}
    </div>
  );
};